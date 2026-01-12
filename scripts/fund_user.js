import hre from "hardhat";

async function main() {
    const [admin] = await hre.ethers.getSigners();
    // Hardcoded address for immediate support
    const receiverAddress = "0xDA7bcD90816865a141Db25d07839BA1FD1573889";

    console.log(`Sending 100 GO from ${admin.address} to ${receiverAddress}...`);

    const tx = await admin.sendTransaction({
        to: receiverAddress,
        value: hre.ethers.parseEther("100.0"), // Send 100 Back
    });

    await tx.wait();

    console.log(`Transferred! Transaction hash: ${tx.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
