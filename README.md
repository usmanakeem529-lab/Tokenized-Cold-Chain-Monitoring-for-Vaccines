# ❄️ Tokenized Cold Chain Monitoring for Vaccines

Welcome to a revolutionary Web3 solution for ensuring vaccine integrity in remote areas! This project uses the Stacks blockchain and Clarity smart contracts to track and verify temperature compliance throughout the vaccine supply chain—from production to distribution. By tokenizing vaccine batches and integrating oracle-fed sensor data, we create an immutable, transparent system that prevents spoilage, automates alerts, and builds trust in global health logistics.

## ✨ Features

🌡️ Real-time temperature monitoring via blockchain oracles  
📦 Tokenized vaccine batches as NFTs for unique tracking  
🚨 Automated alerts and compliance checks for breaches  
🌍 Geo-tagged distribution logs for remote area traceability  
🔒 Immutable audit trails to prove chain-of-custody  
💰 Incentive mechanisms for compliant stakeholders (e.g., token rewards)  
📊 On-chain reporting for regulators and health organizations  
🛡️ Automated invalidation of spoiled batches to prevent use  

## 🛠 How It Works

**For Manufacturers**  
- Mint a Vaccine Batch Token (NFT) representing a new production lot.  
- Integrate IoT sensors to feed temperature data via oracles.  
- Register the batch with initial metadata like production date, temperature requirements, and destination.  

**For Distributors and Transporters**  
- Transfer ownership of the batch token as it moves through the chain.  
- Log checkpoints with geo-data and temperature readings—smart contracts automatically validate compliance.  
- If a temperature breach occurs, the system triggers alerts and flags the batch as non-compliant.  

**For End-Users (e.g., Clinics in Remote Areas)**  
- Verify batch integrity on-chain before administration.  
- Claim rewards for reporting successful deliveries or submit claims if issues arise.  

**For Regulators**  
- Query on-chain reports for full traceability and compliance audits.  

This setup solves the real-world problem of vaccine spoilage in under-resourced regions by leveraging blockchain's transparency to ensure vaccines remain effective, reducing waste and saving lives.

## 📜 Smart Contracts Overview

This project involves 8 Clarity smart contracts, each handling a specific aspect of the cold chain ecosystem for modularity and security:

1. **VaccineBatchNFT**: Manages minting, transferring, and metadata for tokenized vaccine batches (as SIP-009 compliant NFTs).  
2. **TemperatureOracle**: Interfaces with external data feeds to record temperature readings immutably.  
3. **ComplianceValidator**: Checks temperature data against predefined thresholds and flags breaches.  
4. **DistributionTracker**: Logs transfers, geo-locations, and timestamps for each supply chain step.  
5. **StakeholderRegistry**: Registers and verifies participants (manufacturers, distributors, clinics) with roles and permissions.  
6. **AlertNotifier**: Triggers on-chain events and notifications for compliance violations.  
7. **RewardDistributor**: Handles token incentives for maintaining the cold chain (using a fungible token like STX or custom).  
8. **AuditReporter**: Generates verifiable reports and allows queries for historical data and compliance proofs.  

These contracts interact seamlessly: for example, the ComplianceValidator calls the TemperatureOracle to enforce rules during DistributionTracker updates. Deploy them on Stacks for low-cost, Bitcoin-secured operations!