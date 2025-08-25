// tests/compliance-validator.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface BatchCompliance {
  isCompliant: boolean;
  lastChecked: number;
  flaggedReason: string | null;
  excursionCount: number;
  lastExcursionBlock: number | null;
  vaccineType: string;
  minTemp: number;
  maxTemp: number;
}

interface TemperatureReading {
  temperature: number;
  timestamp: number;
  source: string;
}

interface VaccineThresholds {
  minTemp: number;
  maxTemp: number;
}

interface ContractState {
  admin: string;
  paused: boolean;
  batchCompliance: Map<number, BatchCompliance>;
  temperatureHistory: Map<string, TemperatureReading>; // Key: `${batchId}-${readingId}`
  readingCounters: Map<number, number>;
  vaccineThresholds: Map<string, VaccineThresholds>;
}

// Mock contract implementation
class ComplianceValidatorMock {
  private state: ContractState = {
    admin: "deployer",
    paused: false,
    batchCompliance: new Map(),
    temperatureHistory: new Map(),
    readingCounters: new Map(),
    vaccineThresholds: new Map(),
  };

  private ERR_BATCH_NOT_FOUND = 100;
  private ERR_INVALID_TEMPERATURE = 101;
  private ERR_UNAUTHORIZED = 102;
  private ERR_INVALID_THRESHOLD = 103;
  private ERR_EXCURSION_LIMIT_EXCEEDED = 104;
  private ERR_PAUSED = 105;
  private ERR_INVALID_VACCINE_TYPE = 106;
  private ERR_NO_READINGS = 107;
  private ERR_METADATA_TOO_LONG = 108;
  private MAX_EXCURSIONS = 5;
  private EXCURSION_DURATION = 300;
  private MAX_METADATA_LEN = 500;
  private currentBlock = 1000; // Simulated block height

  // Simulate block height increase
  private advanceBlock() {
    this.currentBlock += 1;
  }

  setAdmin(caller: string, newAdmin: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.admin = newAdmin;
    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  setVaccineThresholds(caller: string, vaccineType: string, minTemp: number, maxTemp: number): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (!(maxTemp > minTemp && minTemp <= 100 && maxTemp >= -50)) {
      return { ok: false, value: this.ERR_INVALID_THRESHOLD };
    }
    this.state.vaccineThresholds.set(vaccineType, { minTemp, maxTemp });
    return { ok: true, value: true };
  }

  initializeBatch(caller: string, batchId: number, vaccineType: string): ClarityResponse<boolean> {
    // Assume caller is authorized for simplicity
    const thresholds = this.state.vaccineThresholds.get(vaccineType);
    if (!thresholds) {
      return { ok: false, value: this.ERR_INVALID_VACCINE_TYPE };
    }
    this.state.batchCompliance.set(batchId, {
      isCompliant: true,
      lastChecked: this.currentBlock,
      flaggedReason: null,
      excursionCount: 0,
      lastExcursionBlock: null,
      vaccineType,
      minTemp: thresholds.minTemp,
      maxTemp: thresholds.maxTemp,
    });
    this.state.readingCounters.set(batchId, 0);
    return { ok: true, value: true };
  }

  validateTemperature(caller: string, batchId: number, temperature: number, metadata: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const batch = this.state.batchCompliance.get(batchId);
    if (!batch) {
      return { ok: false, value: this.ERR_BATCH_NOT_FOUND };
    }
    if (metadata.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_METADATA_TOO_LONG };
    }
    // Record reading
    let count = (this.state.readingCounters.get(batchId) ?? 0) + 1;
    this.state.readingCounters.set(batchId, count);
    this.state.temperatureHistory.set(`${batchId}-${count}`, {
      temperature,
      timestamp: this.currentBlock,
      source: caller,
    });

    // Check excursion
    let newBatch = { ...batch };
    const minTemp = newBatch.minTemp;
    const maxTemp = newBatch.maxTemp;
    const isOutOfRange = temperature < minTemp || temperature > maxTemp;
    if (isOutOfRange) {
      if (newBatch.lastExcursionBlock && this.currentBlock - newBatch.lastExcursionBlock < this.EXCURSION_DURATION) {
        // Ongoing
      } else {
        newBatch.excursionCount += 1;
        newBatch.lastExcursionBlock = this.currentBlock;
        if (newBatch.excursionCount >= this.MAX_EXCURSIONS) {
          newBatch.isCompliant = false;
          newBatch.flaggedReason = "Excursion limit exceeded";
        }
      }
    } else {
      newBatch.lastExcursionBlock = null;
    }
    newBatch.lastChecked = this.currentBlock;
    this.state.batchCompliance.set(batchId, newBatch);
    this.advanceBlock();

    if (!newBatch.isCompliant) {
      return { ok: false, value: this.ERR_INVALID_TEMPERATURE };
    }
    return { ok: true, value: true };
  }

  getBatchCompliance(batchId: number): ClarityResponse<BatchCompliance | null> {
    return { ok: true, value: this.state.batchCompliance.get(batchId) ?? null };
  }

  getTemperatureHistory(batchId: number, readingId: number): ClarityResponse<TemperatureReading | null> {
    return { ok: true, value: this.state.temperatureHistory.get(`${batchId}-${readingId}`) ?? null };
  }

  getReadingCount(batchId: number): ClarityResponse<number> {
    return { ok: true, value: this.state.readingCounters.get(batchId) ?? 0 };
  }

  getVaccineThresholds(vaccineType: string): ClarityResponse<VaccineThresholds | null> {
    return { ok: true, value: this.state.vaccineThresholds.get(vaccineType) ?? null };
  }

  isContractPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getAdmin(): ClarityResponse<string> {
    return { ok: true, value: this.state.admin };
  }

  calculateAverageTemperature(batchId: number): ClarityResponse<number> {
    const count = this.state.readingCounters.get(batchId) ?? 0;
    if (count === 0) {
      return { ok: false, value: this.ERR_NO_READINGS };
    }
    let total = 0;
    for (let i = 1; i <= count; i++) {
      const reading = this.state.temperatureHistory.get(`${batchId}-${i}`);
      if (reading) {
        total += reading.temperature;
      }
    }
    return { ok: true, value: Math.floor(total / count) };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  oracle: "oracle",
  user1: "user1",
};

describe("ComplianceValidator Contract", () => {
  let contract: ComplianceValidatorMock;

  beforeEach(() => {
    contract = new ComplianceValidatorMock();
    vi.resetAllMocks();
  });

  it("should allow admin to set vaccine thresholds", () => {
    const result = contract.setVaccineThresholds(accounts.deployer, "mRNA", 2, 8);
    expect(result).toEqual({ ok: true, value: true });
    const thresholds = contract.getVaccineThresholds("mRNA");
    expect(thresholds).toEqual({ ok: true, value: { minTemp: 2, maxTemp: 8 } });
  });

  it("should prevent non-admin from setting thresholds", () => {
    const result = contract.setVaccineThresholds(accounts.user1, "mRNA", 2, 8);
    expect(result).toEqual({ ok: false, value: 102 });
  });

  it("should initialize batch with valid vaccine type", () => {
    contract.setVaccineThresholds(accounts.deployer, "mRNA", 2, 8);
    const initResult = contract.initializeBatch(accounts.deployer, 1, "mRNA");
    expect(initResult).toEqual({ ok: true, value: true });
    const compliance = contract.getBatchCompliance(1);
    expect(compliance).toEqual({
      ok: true,
      value: expect.objectContaining({ isCompliant: true, vaccineType: "mRNA", minTemp: 2, maxTemp: 8 }),
    });
  });

  it("should reject initialization with invalid vaccine type", () => {
    const initResult = contract.initializeBatch(accounts.deployer, 1, "Unknown");
    expect(initResult).toEqual({ ok: false, value: 106 });
  });

  it("should validate temperatures within range", () => {
    contract.setVaccineThresholds(accounts.deployer, "mRNA", 2, 8);
    contract.initializeBatch(accounts.deployer, 1, "mRNA");
    const validateResult = contract.validateTemperature(accounts.oracle, 1, 5, "Normal reading");
    expect(validateResult).toEqual({ ok: true, value: true });
    const compliance = contract.getBatchCompliance(1);
    expect(compliance.value?.isCompliant).toBe(true);
    expect(contract.getReadingCount(1)).toEqual({ ok: true, value: 1 });
  });

  it("should handle excursions without flagging if under limit", () => {
    contract.setVaccineThresholds(accounts.deployer, "mRNA", 2, 8);
    contract.initializeBatch(accounts.deployer, 1, "mRNA");
    contract.validateTemperature(accounts.oracle, 1, 9, "Slight excursion"); // Out
    const compliance1 = contract.getBatchCompliance(1);
    expect(compliance1.value?.excursionCount).toBe(1);
    expect(compliance1.value?.isCompliant).toBe(true);
  });

  it("should calculate average temperature", () => {
    contract.setVaccineThresholds(accounts.deployer, "mRNA", 2, 8);
    contract.initializeBatch(accounts.deployer, 1, "mRNA");
    contract.validateTemperature(accounts.oracle, 1, 4, "Reading 1");
    contract.validateTemperature(accounts.oracle, 1, 6, "Reading 2");
    const avg = contract.calculateAverageTemperature(1);
    expect(avg).toEqual({ ok: true, value: 5 });
  });

  it("should prevent operations when paused", () => {
    contract.pauseContract(accounts.deployer);
    const validateResult = contract.validateTemperature(accounts.oracle, 1, 5, "Paused");
    expect(validateResult).toEqual({ ok: false, value: 105 });
  });

  it("should reject long metadata", () => {
    contract.setVaccineThresholds(accounts.deployer, "mRNA", 2, 8);
    contract.initializeBatch(accounts.deployer, 1, "mRNA");
    const longMetadata = "a".repeat(501);
    const validateResult = contract.validateTemperature(accounts.oracle, 1, 5, longMetadata);
    expect(validateResult).toEqual({ ok: false, value: 108 });
  });
});