;; compliance-validator.clar
;; Core contract for validating temperature compliance in vaccine cold chain
;; Integrates with VaccineBatchNFT for batch status and TemperatureOracle for data feeds

;; Constants
(define-constant ERR_BATCH_NOT_FOUND u100)
(define-constant ERR_INVALID_TEMPERATURE u101)
(define-constant ERR_UNAUTHORIZED u102)
(define-constant ERR_INVALID_THRESHOLD u103)
(define-constant ERR_EXCURSION_LIMIT_EXCEEDED u104)
(define-constant ERR_PAUSED u105)
(define-constant ERR_INVALID_VACCINE_TYPE u106)
(define-constant ERR_NO_READINGS u107)
(define-constant ERR_METADATA_TOO_LONG u108)
(define-constant MAX_EXCURSIONS u5) ;; Max allowed brief temperature excursions
(define-constant EXCURSION_DURATION u300) ;; Max duration for an excursion in blocks (~5 minutes assuming 1 block/min)
(define-constant MAX_METADATA_LEN u500)

;; Data Variables
(define-data-var contract-admin principal tx-sender)
(define-data-var paused bool false)

;; Data Maps
;; Batch compliance status
(define-map batch-compliance
  { batch-id: uint }
  {
    is-compliant: bool,
    last-checked: uint,
    flagged-reason: (optional (string-utf8 256)),
    excursion-count: uint,
    last-excursion-block: (optional uint),
    vaccine-type: (string-ascii 32),
    min-temp: int,
    max-temp: int
  })

;; Historical temperature readings (list per batch, limited to last 100 for gas efficiency)
(define-map temperature-history
  { batch-id: uint, reading-id: uint }
  {
    temperature: int,
    timestamp: uint,
    source: principal
  })

;; Reading counter per batch
(define-map reading-counters { batch-id: uint } { count: uint })

;; Vaccine type thresholds (admin-set)
(define-map vaccine-thresholds
  { vaccine-type: (string-ascii 32) }
  { min-temp: int, max-temp: int })

;; Private Functions
(define-private (is-admin (caller principal))
  (is-eq caller (var-get contract-admin)))

(define-private (validate-thresholds (min-temp int) (max-temp int))
  (and (> max-temp min-temp) (<= min-temp 100) (>= max-temp -50)))

(define-private (record-reading (batch-id uint) (temperature int) (source principal))
  (let ((counter (default-to { count: u0 } (map-get? reading-counters { batch-id: batch-id })))
        (new-count (+ (get count counter) u1)))
    (map-set reading-counters { batch-id: batch-id } { count: new-count })
    (map-set temperature-history
      { batch-id: batch-id, reading-id: new-count }
      { temperature: temperature, timestamp: block-height, source: source })
    new-count))

(define-private (check-excursion (batch { is-compliant: bool, last-checked: uint, flagged-reason: (optional (string-utf8 256)), excursion-count: uint, last-excursion-block: (optional uint), vaccine-type: (string-ascii 32), min-temp: int, max-temp: int }) (temperature int) (current-block uint))
  (let ((min-temp (get min-temp batch))
        (max-temp (get max-temp batch))
        (excursion-count (get excursion-count batch))
        (last-excursion (get last-excursion-block batch)))
    (if (or (< temperature min-temp) (> temperature max-temp))
      (if (and (is-some last-excursion) (< (- current-block (unwrap-panic last-excursion)) EXCURSION_DURATION))
        batch
        (if (>= (+ excursion-count u1) MAX_EXCURSIONS)
          (merge batch { is-compliant: false, flagged-reason: (some u"Excursion limit exceeded"), excursion-count: (+ excursion-count u1), last-excursion-block: (some current-block) })
          (merge batch { excursion-count: (+ excursion-count u1), last-excursion-block: (some current-block) })))
      (if (is-some last-excursion)
        (merge batch { last-excursion-block: none })
        batch))))

;; Public Functions
(define-public (set-admin (new-admin principal))
  (if (is-admin tx-sender)
    (begin
      (var-set contract-admin new-admin)
      (ok true))
    (err ERR_UNAUTHORIZED)))

(define-public (pause-contract)
  (if (is-admin tx-sender)
    (begin
      (var-set paused true)
      (ok true))
    (err ERR_UNAUTHORIZED)))

(define-public (unpause-contract)
  (if (is-admin tx-sender)
    (begin
      (var-set paused false)
      (ok true))
    (err ERR_UNAUTHORIZED)))

(define-public (set-vaccine-thresholds (vaccine-type (string-ascii 32)) (min-temp int) (max-temp int))
  (if (is-admin tx-sender)
    (if (validate-thresholds min-temp max-temp)
      (begin
        (map-set vaccine-thresholds { vaccine-type: vaccine-type } { min-temp: min-temp, max-temp: max-temp })
        (ok true))
      (err ERR_INVALID_THRESHOLD))
    (err ERR_UNAUTHORIZED)))

(define-public (initialize-batch (batch-id uint) (vaccine-type (string-ascii 32)))
  (let ((thresholds (map-get? vaccine-thresholds { vaccine-type: vaccine-type })))
    (if (is-some thresholds)
      (let ((thresh (unwrap-panic thresholds)))
        (map-set batch-compliance
          { batch-id: batch-id }
          {
            is-compliant: true,
            last-checked: block-height,
            flagged-reason: none,
            excursion-count: u0,
            last-excursion-block: none,
            vaccine-type: vaccine-type,
            min-temp: (get min-temp thresh),
            max-temp: (get max-temp thresh)
          })
        (ok true))
      (err ERR_INVALID_VACCINE_TYPE))))

(define-public (validate-temperature (batch-id uint) (temperature int) (metadata (string-utf8 500)))
  (if (var-get paused)
    (err ERR_PAUSED)
    (let ((batch (map-get? batch-compliance { batch-id: batch-id })))
      (if (is-some batch)
        (let ((unwrapped-batch (unwrap-panic batch))
              (current-block block-height))
          (if (> (len metadata) MAX_METADATA_LEN)
            (err ERR_METADATA_TOO_LONG)
            (let ((new-batch (check-excursion unwrapped-batch temperature current-block)))
              (record-reading batch-id temperature tx-sender)
              (map-set batch-compliance { batch-id: batch-id }
                (merge new-batch { last-checked: current-block }))
              (if (get is-compliant new-batch)
                (ok true)
                (begin
                  (print { event: "compliance-breach", batch-id: batch-id, reason: (get flagged-reason new-batch) })
                  (err ERR_INVALID_TEMPERATURE))))))
        (err ERR_BATCH_NOT_FOUND)))))

;; Read-Only Functions
(define-read-only (get-batch-compliance (batch-id uint))
  (map-get? batch-compliance { batch-id: batch-id }))

(define-read-only (get-temperature-history (batch-id uint) (reading-id uint))
  (map-get? temperature-history { batch-id: batch-id, reading-id: reading-id }))

(define-read-only (get-reading-count (batch-id uint))
  (default-to u0 (get count (map-get? reading-counters { batch-id: batch-id }))))

(define-read-only (get-vaccine-thresholds (vaccine-type (string-ascii 32)))
  (map-get? vaccine-thresholds { vaccine-type: vaccine-type }))

(define-read-only (is-contract-paused)
  (var-get paused))

(define-read-only (get-admin)
  (var-get contract-admin))

(define-read-only (calculate-average-temperature (batch-id uint))
  (let ((count (get-reading-count batch-id)))
    (if (is-eq count u0)
      (err ERR_NO_READINGS)
      (let ((sum (fold sum-temperatures (list-from-to u1 count) { batch-id: batch-id, total: 0 })))
        (ok (/ (get total sum) (to-int count)))))))

(define-private (sum-temperatures (reading-id uint) (acc { batch-id: uint, total: int }))
  (let ((reading (map-get? temperature-history { batch-id: (get batch-id acc), reading-id: reading-id })))
    (if (is-some reading)
      (merge acc { total: (+ (get total acc) (get temperature (unwrap-panic reading))) })
      acc)))

(define-private (list-from-to (start uint) (end uint))
  (let ((len (- end start)))
    (if (<= len u0)
      (list)
      (unwrap-panic
        (slice? (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20
                      u21 u22 u23 u24 u25 u26 u27 u28 u29 u30 u31 u32 u33 u34 u35 u36 u37 u38 u39 u40
                      u41 u42 u43 u44 u45 u46 u47 u48 u49 u50 u51 u52 u53 u54 u55 u56 u57 u58 u59 u60
                      u61 u62 u63 u64 u65 u66 u67 u68 u69 u70 u71 u72 u73 u74 u75 u76 u77 u78 u79 u80
                      u81 u82 u83 u84 u85 u86 u87 u88 u89 u90 u91 u92 u93 u94 u95 u96 u97 u98 u99 u100)
                start (+ start len))))))