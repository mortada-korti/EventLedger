# Blockchain Event Ticketing System

A decentralized application (dApp) for creating and managing event tickets on the blockchain. This project allows event organizers to create events, and users to buy, transfer, and refund tickets using cryptocurrency (ETH/GO).

## 🏗 Architecture

The project is divided into two main parts:

1.  **Smart Contracts (Backend)**: Built with **Hardhat** and **Solidity**. Handles the logic for event creation, ticket sales, refunds, and fund withdrawal.
2.  **Frontend**: Built with **Next.js** and **Ethers.js**. Provides a user-friendly interface to interact with the smart contract.

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [MetaMask](https://metamask.io/) browser extension

## 🚀 Installation & Setup

### 1. Clone & Install Dependencies

Open a terminal in the project root:

```bash
# Install root dependencies (Hardhat, etc.)
npm install

# Install frontend dependencies
cd frontend
npm install
```

### 2. Start the Local Blockchain

In the project root, start a local Hardhat node. This gives you 10 accounts with 10,000 ETH each for testing.

```bash
npx hardhat node
```

> **Note**: Keep this terminal running!

### 3. Deploy the Smart Contract

Open a **new terminal** in the project root (do not close the `npx hardhat node` terminal).

```bash
npx hardhat ignition deploy ignition/modules/EventTicketing.js --network localhost
```

**Important**:
- Note the deployed contract address from the output.
- The frontend is configured to look for the contract at a specific address (check `frontend/app/constants.js`).
- If the deployment address changes (it shouldn't if you restart the node fresh), update `CONTRACT_ADDRESS` in `frontend/app/constants.js`.
- The ABI is automatically available in `frontend/EventTicketing.json` (ensure your deployment script or setup keeps this updated, or manually copy it if needed, though this project structure assumes it's present).

### 4. Run the Frontend

Switch to the `frontend` directory:

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🦊 Connecting MetaMask

1.  Open MetaMask.
2.  Add a new network manually:
    -   **Network Name**: Localhost 8545
    -   **RPC URL**: `http://127.0.0.1:8545`
    -   **Chain ID**: `31337`
    -   **Currency Symbol**: `GO` (or `ETH`)
3.  Import one of the accounts from the `npx hardhat node` output using its **Private Key**.

## 💡 Usage

1.  **Create Event**: Connect your wallet, go to "Create Event", and fill in details (Title, Price, Date, Capacity).
2.  **Buy Ticket**: details of an active event and click "Buy Ticket".
3.  **My Tickets**: View your purchased tickets.
4.  **Refunds**: Request a refund if eligible (event canceled or >24h before start).
5.  **Organizer Actions**: As an organizer, you can Cancel events or Withdraw funds after the event ends.

## 🧪 Running Tests

To run the smart contract tests:

```bash
npx hardhat test
```
