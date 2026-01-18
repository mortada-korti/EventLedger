const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    // 1. Read the address from constants.js
    const constantsPath = path.join(__dirname, "../frontend/app/constants.js");
    const constantsContent = fs.readFileSync(constantsPath, "utf8");
    const match = constantsContent.match(/CONTRACT_ADDRESS = "(0x[a-fA-F0-9]{40})"/);

    if (!match) {
        console.error("❌ Could not find CONTRACT_ADDRESS in constants.js");
        process.exit(1);
    }

    const address = match[1];
    console.log(`🔎 Checking address: ${address}`);

    // 2. Connect to Localhost
    // Try standard Hardhat URL
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    try {
        const network = await provider.getNetwork();
        console.log(`✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    } catch (e) {
        console.error("❌ Could not connect to localhost:8545. Is 'npx hardhat node' running?");
        process.exit(1);
    }

    // 3. Check Code
    const code = await provider.getCode(address);
    console.log(`📝 Code at address: ${code.slice(0, 50)}...`);

    if (code === "0x") {
        console.error("❌ NO CODE FOUND at this address! The contract is not deployed here.");
        console.log("👉 Suggestion: Restart 'npx hardhat node' and run 'npx hardhat ignition deploy ... --network localhost'");
    } else {
        console.log("✅ Contract code exists! The issue might be in the frontend ABI or MetaMask connection.");
    }
}

main().catch(console.error);
