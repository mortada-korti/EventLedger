const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EventTicketing", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployEventTicketingFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner, organizer, buyer, otherAccount] = await ethers.getSigners();

        const EventTicketing = await ethers.getContractFactory("EventTicketing");
        const eventTicketing = await EventTicketing.deploy();

        return { eventTicketing, owner, organizer, buyer, otherAccount };
    }

    describe("Deployment", function () {
        it("Should start with nextEventId as 0", async function () {
            const { eventTicketing } = await loadFixture(deployEventTicketingFixture);
            expect(await eventTicketing.nextEventId()).to.equal(0);
        });
    });

    describe("Creating Events", function () {
        it("Should create an event successfully", async function () {
            const { eventTicketing, organizer } = await loadFixture(deployEventTicketingFixture);

            const title = "Concert";
            const price = ethers.parseEther("1");
            const futureDate = (await time.latest()) + 86400 * 2; // 2 days from now
            const endDate = futureDate + 3600; // 1 hour duration
            const capacity = 100;

            await expect(eventTicketing.connect(organizer).createEvent(title, price, futureDate, endDate, capacity))
                .to.emit(eventTicketing, "EventCreated")
                .withArgs(0, organizer.address, title, futureDate, endDate);

            const event = await eventTicketing.events(0);
            expect(event.title).to.equal(title);
            expect(event.organizer).to.equal(organizer.address);
            expect(event.capacity).to.equal(capacity);
        });

        it("Should fail if date is in the past", async function () {
            const { eventTicketing, organizer } = await loadFixture(deployEventTicketingFixture);
            const pastDate = (await time.latest()) - 100;
            const endDate = pastDate + 3600;

            await expect(
                eventTicketing.connect(organizer).createEvent("Past Event", 100, pastDate, endDate, 50)
            ).to.be.revertedWith("Event date must be in the future");
        });

        it("Should fail if endDate is before startDate", async function () {
            const { eventTicketing, organizer } = await loadFixture(deployEventTicketingFixture);
            const futureDate = (await time.latest()) + 86400;
            const invalidEndDate = futureDate - 100;

            await expect(
                eventTicketing.connect(organizer).createEvent("Bad Dates", 100, futureDate, invalidEndDate, 50)
            ).to.be.revertedWith("End date must be after start date");
        });

        it("Should fail if capacity is 0", async function () {
            const { eventTicketing, organizer } = await loadFixture(deployEventTicketingFixture);
            const futureDate = (await time.latest()) + 86400;
            const endDate = futureDate + 3600;

            await expect(
                eventTicketing.connect(organizer).createEvent("Zero Cap", 100, futureDate, endDate, 0)
            ).to.be.revertedWith("Capacity must be greater than 0");
        });
    });

    describe("Buying Tickets", function () {
        async function createEventFixture() {
            const { eventTicketing, organizer, buyer, otherAccount } = await loadFixture(deployEventTicketingFixture);
            const price = ethers.parseEther("1");
            const date = (await time.latest()) + 86400 * 2; // 2 days
            const endDate = date + 3600;
            const capacity = 10;

            await eventTicketing.connect(organizer).createEvent("Concert", price, date, endDate, capacity);
            return { eventTicketing, organizer, buyer, otherAccount, price, date, endDate, capacity, eventId: 0 };
        }

        it("Should buy tickets successfully", async function () {
            const { eventTicketing, buyer, price, eventId } = await loadFixture(createEventFixture);
            const quantity = 2;
            const cost = price * BigInt(quantity);

            await expect(eventTicketing.connect(buyer).buyTicket(eventId, quantity, { value: cost }))
                .to.emit(eventTicketing, "TicketPurchased")
                .withArgs(eventId, buyer.address, quantity);

            const ticketCount = await eventTicketing.tickets(eventId, buyer.address);
            expect(ticketCount).to.equal(quantity);
        });

        it("Should fail if insufficient ether sent", async function () {
            const { eventTicketing, buyer, price, eventId } = await loadFixture(createEventFixture);
            const quantity = 1;
            const insufficientAmount = price - BigInt(1);

            await expect(
                eventTicketing.connect(buyer).buyTicket(eventId, quantity, { value: insufficientAmount })
            ).to.be.revertedWith("Incorrect Ether sent");
        });

        it("Should fail if not enough tickets left", async function () {
            const { eventTicketing, buyer, price, eventId, capacity } = await loadFixture(createEventFixture);
            const quantity = capacity + 1;
            const cost = price * BigInt(quantity);

            await expect(
                eventTicketing.connect(buyer).buyTicket(eventId, quantity, { value: cost })
            ).to.be.revertedWith("Not enough tickets left");
        });

        it("Should fail if event has ended", async function () {
            const { eventTicketing, buyer, price, eventId, endDate } = await loadFixture(createEventFixture);

            await time.increaseTo(endDate + 1);

            await expect(
                eventTicketing.connect(buyer).buyTicket(eventId, 1, { value: price })
            ).to.be.revertedWith("Event has ended");
        });

        it("Should fail if event is canceled", async function () {
            const { eventTicketing, organizer, buyer, price, eventId } = await loadFixture(createEventFixture);

            await eventTicketing.connect(organizer).cancelEvent(eventId);

            await expect(
                eventTicketing.connect(buyer).buyTicket(eventId, 1, { value: price })
            ).to.be.revertedWith("Event is canceled");
        });
    });

    describe("Canceling Events", function () {
        async function createEventFixture() {
            const { eventTicketing, organizer, buyer, otherAccount } = await loadFixture(deployEventTicketingFixture);
            const price = ethers.parseEther("1");
            const date = (await time.latest()) + 86400 * 2;
            const endDate = date + 3600;

            await eventTicketing.connect(organizer).createEvent("Concert", price, date, endDate, 100);
            return { eventTicketing, organizer, buyer, otherAccount, date, eventId: 0 };
        }

        it("Should allow organizer to cancel event", async function () {
            const { eventTicketing, organizer, eventId } = await loadFixture(createEventFixture);

            await expect(eventTicketing.connect(organizer).cancelEvent(eventId))
                .to.emit(eventTicketing, "EventCanceled")
                .withArgs(eventId);

            const event = await eventTicketing.events(eventId);
            expect(event.isCanceled).to.be.true;
        });

        it("Should not allow non-organizer to cancel", async function () {
            const { eventTicketing, otherAccount, eventId } = await loadFixture(createEventFixture);

            await expect(
                eventTicketing.connect(otherAccount).cancelEvent(eventId)
            ).to.be.revertedWith("Only organizer can cancel");
        });

        it("Should not allow verify cancellation if already started", async function () {
            const { eventTicketing, organizer, date, eventId } = await loadFixture(createEventFixture);

            await time.increaseTo(date + 1);

            await expect(
                eventTicketing.connect(organizer).cancelEvent(eventId)
            ).to.be.revertedWith("Event has already started");
        });
    });

    describe("Refunds", function () {
        async function boughtTicketsFixture() {
            const { eventTicketing, organizer, buyer, otherAccount } = await loadFixture(deployEventTicketingFixture);
            const price = ethers.parseEther("1");
            const date = (await time.latest()) + 86400 * 2; // 2 days
            const endDate = date + 3600;
            const eventId = 0;

            await eventTicketing.connect(organizer).createEvent("Concert", price, date, endDate, 100);
            await eventTicketing.connect(buyer).buyTicket(eventId, 2, { value: price * BigInt(2) });

            return { eventTicketing, organizer, buyer, date, price, eventId };
        }

        it("Should refund successfully if > 24 hours before start", async function () {
            const { eventTicketing, buyer, eventId, price } = await loadFixture(boughtTicketsFixture);

            // Current time is well before 24h limit (created 48h in future)
            // Current time is well before 24h limit (created 48h in future)
            const tx = eventTicketing.connect(buyer).requestRefund(eventId);

            await expect(tx)
                .to.changeEtherBalances(
                    [buyer, eventTicketing],
                    [price * BigInt(2), -(price * BigInt(2))]
                );

            await expect(tx)
                .to.emit(eventTicketing, "RefundIssued")
                .withArgs(eventId, buyer.address, price * BigInt(2));
        });

        it("Should NOT refund if < 24 hours before start and not canceled", async function () {
            const { eventTicketing, buyer, date, eventId } = await loadFixture(boughtTicketsFixture);

            // Move within 23 hours of start
            const oneDay = 86400;
            await time.increaseTo(date - oneDay + 3600); // 1 day before + 1 hour => 23 hours before

            await expect(
                eventTicketing.connect(buyer).requestRefund(eventId)
            ).to.be.revertedWith("Refund not allowed (Time limit passed)");
        });

        it("Should refund if event is canceled (even if close to start time)", async function () {
            const { eventTicketing, organizer, buyer, date, eventId, price } = await loadFixture(boughtTicketsFixture);

            await eventTicketing.connect(organizer).cancelEvent(eventId);

            // Even if we are close to start time, cancellation overrides time limit
            // (Though cancellation itself must happen before start)

            await expect(eventTicketing.connect(buyer).requestRefund(eventId))
                .to.changeEtherBalances(
                    [buyer, eventTicketing],
                    [price * BigInt(2), -(price * BigInt(2))]
                );
        });

        it("Should fail if user has no tickets", async function () {
            const { eventTicketing, organizer, eventId } = await loadFixture(boughtTicketsFixture);
            const nonBuyer = organizer; // Organizer didn't buy tickets

            await expect(
                eventTicketing.connect(nonBuyer).requestRefund(eventId)
            ).to.be.revertedWith("No tickets to refund");
        });
    });

    describe("Withdrawals", function () {
        async function soldOutEventFixture() {
            const { eventTicketing, organizer, buyer } = await loadFixture(deployEventTicketingFixture);
            const price = ethers.parseEther("1");
            const date = (await time.latest()) + 86400; // 1 day
            const endDate = date + 3600;
            const eventId = 0;

            await eventTicketing.connect(organizer).createEvent("Concert", price, date, endDate, 100);
            await eventTicketing.connect(buyer).buyTicket(eventId, 5, { value: price * BigInt(5) });

            return { eventTicketing, organizer, buyer, endDate, price, eventId };
        }

        it("Should allow organizer to withdraw after event ends", async function () {
            const { eventTicketing, organizer, endDate, price, eventId } = await loadFixture(soldOutEventFixture);

            await time.increaseTo(endDate + 1);
            const expectedAmount = price * BigInt(5);

            const tx = eventTicketing.connect(organizer).withdrawFunds(eventId);

            await expect(tx)
                .to.changeEtherBalances(
                    [organizer, eventTicketing],
                    [expectedAmount, -expectedAmount]
                );

            await expect(tx)
                .to.emit(eventTicketing, "FundsWithdrawn")
                .withArgs(eventId, organizer.address, expectedAmount);
        });

        it("Should fail if event has not ended", async function () {
            const { eventTicketing, organizer, eventId } = await loadFixture(soldOutEventFixture);

            await expect(
                eventTicketing.connect(organizer).withdrawFunds(eventId)
            ).to.be.revertedWith("Event has not ended yet");
        });

        it("Should fail if event is canceled", async function () {
            const { eventTicketing, organizer, eventId, endDate } = await loadFixture(soldOutEventFixture);

            await eventTicketing.connect(organizer).cancelEvent(eventId);
            await time.increaseTo(endDate + 1);

            await expect(
                eventTicketing.connect(organizer).withdrawFunds(eventId)
            ).to.be.revertedWith("Event is canceled, cannot withdraw");
        });

        it("Should fail if non-organizer tries to withdraw", async function () {
            const { eventTicketing, buyer, eventId, endDate } = await loadFixture(soldOutEventFixture);

            await time.increaseTo(endDate + 1);

            await expect(
                eventTicketing.connect(buyer).withdrawFunds(eventId)
            ).to.be.revertedWith("Only organizer can withdraw");
        });
    });
});
