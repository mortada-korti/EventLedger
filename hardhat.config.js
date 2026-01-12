import "@nomicfoundation/hardhat-toolbox";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
    solidity: "0.8.28",
    networks: {
        hardhat: {
            accounts: {
                count: 10,
                accountsBalance: "1000000000000000000000" // 1000 ETH in wei
            }
        }
    }
};
