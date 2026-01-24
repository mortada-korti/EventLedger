require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
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
