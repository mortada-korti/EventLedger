import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("RulesVerification", function () {
    let EventTicketing;
    let contract;
    let owner;
    let organizer;
    let buyer;
    let addrs;

    beforeEach(async function () {
        [owner, organizer, buyer, ...addrs] = await ethers.getSigners();
        EventTicketing = await ethers.getContractFactory("EventTicketing");
        contract = await EventTicketing.deploy();
        // In strict ESM/newer ethers, deploy() returns a contract that might need waitForDeployment()
        // But hardhat-toolbox usually handles this. Let's stick to standard practice.
        await contract.waitForDeployment();
    });

    it("Should prevent fund withdrawal before event end", async function () {
        const now = await time.latest();
        const startTime = now + 86400 * 2; // 2 days from now
        const endTime = startTime + 3600;  // 1 hour event
        const price = ethers.parseEther("1");

        // 1. Create Event
        await contract.connect(organizer).createEvent("Test Event", price, startTime, endTime, 100);
        const eventId = 0;

        // 2. Buy one ticket
        await contract.connect(buyer).buyTicket(eventId, { value: price });

        // 3. Attempt withdrawal BEFORE end time
        await expect(
            contract.connect(organizer).withdrawFunds(eventId)
        ).to.be.revertedWith("Event has not ended yet");

        // 4. Fast forward to AFTER end time
        await time.increaseTo(endTime + 1);

        // 5. Attempt withdrawal AFTER end time -> Success
        await expect(
            contract.connect(organizer).withdrawFunds(eventId)
        ).to.emit(contract, "FundsWithdrawn")
            .withArgs(eventId, organizer.address, price);
    });

    it("Should prevent refunds less than 24h before start (if not canceled)", async function () {
        const now = await time.latest();
        const startTime = now + 86400 * 3; // 3 days from now
        const endTime = startTime + 3600;
        const price = ethers.parseEther("1");

        await contract.connect(organizer).createEvent("Refund Test", price, startTime, endTime, 100);
        const eventId = 0;
        await contract.connect(buyer).buyTicket(eventId, { value: price });

        // 1. Request refund 25 hours before start -> Success
        // Target: startTime - 25 hours.
        await time.increaseTo(startTime - 25 * 3600);

        // We already bought, so we can refund now.
        // Note: The previous run_command attempt had a comment about "rebuy". 
        // Since we create a fresh contract in beforeEach, we just need to test strict logic.
        // This test block does one success case.

        await expect(
            contract.connect(buyer).requestRefund(eventId)
        ).to.emit(contract, "RefundIssued")
            .withArgs(eventId, buyer.address, price);
    });

    it("Strict 24h Refund Rule", async function () {
        const now = await time.latest();
        const startTime = now + 86400 * 2; // 48h from now
        const endTime = startTime + 3600;
        const price = ethers.parseEther("1");

        // Create Event
        await contract.connect(organizer).createEvent("Strict Rule", price, startTime, endTime, 100);
        const eventId = 0;

        // Buy Ticket
        await contract.connect(buyer).buyTicket(eventId, { value: price });

        // Move to 23 hours before start
        const twentyThreeHoursBefore = startTime - 23 * 3600;
        await time.increaseTo(twentyThreeHoursBefore);

        // Attempt Refund -> Revert
        await expect(
            contract.connect(buyer).requestRefund(eventId)
        ).to.be.revertedWith("Refund not allowed (Time limit passed and not canceled)");
    });

    it("Should allow instant refund if canceled (even <24h)", async function () {
        const now = await time.latest();
        // Event starts in 1 hour (less than 24h)
        const startTime = now + 3600;
        const endTime = startTime + 3600;
        const price = ethers.parseEther("1");

        await contract.connect(organizer).createEvent("Cancel Test", price, startTime, endTime, 100);
        const eventId = 0;
        await contract.connect(buyer).buyTicket(eventId, { value: price });

        // 1. Try generic refund -> Revert (too close)
        await expect(
            contract.connect(buyer).requestRefund(eventId)
        ).to.be.revertedWith("Refund not allowed (Time limit passed and not canceled)");

        // 2. Organizer cancels
        await contract.connect(organizer).cancelEvent(eventId);

        // 3. Try refund again -> Success
        await expect(
            contract.connect(buyer).requestRefund(eventId)
        ).to.emit(contract, "RefundIssued")
            .withArgs(eventId, buyer.address, price);
    });

    it("Should prevent cancellation after event start", async function () {
        const now = await time.latest();
        const startTime = now + 3600; // 1 hour from now
        const endTime = startTime + 3600;
        const price = ethers.parseEther("1");

        await contract.connect(organizer).createEvent("Late Cancel", price, startTime, endTime, 100);
        const eventId = 0;

        // 1. Cancel before start -> Success
        // Wait, we can't un-cancel. So we need two events or just test the failure case.
        // Let's test the failure case as it's the new rule.

        // Move to AFTER start
        await time.increaseTo(startTime + 1);

        // 2. Attempt cancel -> Revert
        await expect(
            contract.connect(organizer).cancelEvent(eventId)
        ).to.be.revertedWith("Event has already started");
    });
});
