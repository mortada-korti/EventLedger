import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("EventTicketing", function () {
    async function deployFixture() {
        const [owner, organizer, buyer1, buyer2] = await ethers.getSigners();
        const EventTicketing = await ethers.getContractFactory("EventTicketing");
        const ticketing = await EventTicketing.deploy();
        return { ticketing, owner, organizer, buyer1, buyer2 };
    }

    describe("Deployment", function () {
        it("Should start with 0 events", async function () {
            const { ticketing } = await loadFixture(deployFixture);
            expect(await ticketing.nextEventId()).to.equal(0);
        });
    });

    describe("Event Creation", function () {
        it("Should allow creating an event", async function () {
            const { ticketing, organizer } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2; // 2 days from now
            const endDate = futureDate + 3600; // 1 hr later

            await expect(ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100))
                .to.emit(ticketing, "EventCreated")
                .withArgs(0, organizer.address, "Concert", futureDate, endDate);

            const event = await ticketing.events(0);
            expect(event.title).to.equal("Concert");
            expect(event.organizer).to.equal(organizer.address);
        });
    });

    describe("Buying Tickets", function () {
        it("Should allow buying a ticket", async function () {
            const { ticketing, organizer, buyer1 } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2;
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);

            await expect(ticketing.connect(buyer1).buyTicket(0, { value: ethers.parseEther("1") }))
                .to.emit(ticketing, "TicketPurchased")
                .withArgs(0, buyer1.address, 1);

            expect(await ticketing.tickets(0, buyer1.address)).to.equal(1);
        });

        it("Should fail if incorrect amount sent", async function () {
            const { ticketing, organizer, buyer1 } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2;
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);

            await expect(ticketing.connect(buyer1).buyTicket(0, { value: ethers.parseEther("0.5") }))
                .to.revertedWith("Incorrect Ether sent");
        });
    });

    describe("Refunds", function () {
        it("Should allow refund if > 24h before event", async function () {
            const { ticketing, organizer, buyer1 } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 3; // 3 days
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);
            await ticketing.connect(buyer1).buyTicket(0, { value: ethers.parseEther("1") });

            await expect(ticketing.connect(buyer1).requestRefund(0))
                .to.emit(ticketing, "RefundIssued")
                .withArgs(0, buyer1.address, ethers.parseEther("1"));

            expect(await ticketing.tickets(0, buyer1.address)).to.equal(0);
        });

        it("Should NOT allow refund if < 24h before event", async function () {
            const { ticketing, organizer, buyer1 } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2;
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);
            await ticketing.connect(buyer1).buyTicket(0, { value: ethers.parseEther("1") });

            // Advance time to 1 hour before event
            await time.increaseTo(futureDate - 3600);

            await expect(ticketing.connect(buyer1).requestRefund(0))
                .to.revertedWith("Refund not allowed (Time limit passed and not canceled)");
        });
    });

    describe("Cancellation", function () {
        it("Should allow organizer to cancel", async function () {
            const { ticketing, organizer } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2;
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);

            await expect(ticketing.connect(organizer).cancelEvent(0))
                .to.emit(ticketing, "EventCanceled").withArgs(0);

            const event = await ticketing.events(0);
            expect(event.isCanceled).to.be.true;
        });

        it("Should allow refund AFTER cancellation even if late", async function () {
            const { ticketing, organizer, buyer1 } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2;
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);
            await ticketing.connect(buyer1).buyTicket(0, { value: ethers.parseEther("1") });

            // Advance time to 1 hour before event
            await time.increaseTo(futureDate - 3600);

            // Cancel
            await ticketing.connect(organizer).cancelEvent(0);

            // Refund should now work
            await expect(ticketing.connect(buyer1).requestRefund(0))
                .to.emit(ticketing, "RefundIssued");
        });
    });

    describe("Withdrawal", function () {
        it("Should allow organizer to withdraw after event ENDS", async function () {
            const { ticketing, organizer, buyer1 } = await loadFixture(deployFixture);
            const futureDate = (await time.latest()) + 86400 * 2;
            const endDate = futureDate + 3600;
            await ticketing.connect(organizer).createEvent("Concert", ethers.parseEther("1"), futureDate, endDate, 100);
            await ticketing.connect(buyer1).buyTicket(0, { value: ethers.parseEther("1") });

            // Event passes start but NOT end
            await time.increaseTo(futureDate + 60);
            await expect(ticketing.connect(organizer).withdrawFunds(0))
                .to.revertedWith("Event has not ended yet");

            // Event passes END
            await time.increaseTo(endDate + 1);

            await expect(ticketing.connect(organizer).withdrawFunds(0))
                .to.changeEtherBalances([ticketing, organizer], [ethers.parseEther("-1"), ethers.parseEther("1")]);
        });
    });
});
