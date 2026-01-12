// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EventTicketing {
    struct Event {
        uint256 id;
        address organizer;
        string title;
        uint256 price;
        uint256 date;
        uint256 endDate; 
        uint256 capacity;
        uint256 soldCount;
        bool isCanceled;
        bool fundsWithdrawn;
    }

    uint256 public nextEventId;
    mapping(uint256 => Event) public events;
    // eventId => (userAddress => ticketCount)
    mapping(uint256 => mapping(address => uint256)) public tickets;

    event EventCreated(uint256 indexed id, address indexed organizer, string title, uint256 date, uint256 endDate);
    event TicketPurchased(uint256 indexed eventId, address indexed buyer, uint256 count);
    event EventCanceled(uint256 indexed eventId);
    event RefundIssued(uint256 indexed eventId, address indexed buyer, uint256 amount);
    event FundsWithdrawn(uint256 indexed eventId, address indexed organizer, uint256 amount);

    function createEvent(
        string memory _title,
        uint256 _price,
        uint256 _date,
        uint256 _endDate,
        uint256 _capacity
    ) external {
        require(_date > block.timestamp, "Event date must be in the future");
        require(_endDate > _date, "End date must be after start date");
        require(_capacity > 0, "Capacity must be greater than 0");

        events[nextEventId] = Event({
            id: nextEventId,
            organizer: msg.sender,
            title: _title,
            price: _price,
            date: _date,
            endDate: _endDate,
            capacity: _capacity,
            soldCount: 0,
            isCanceled: false,
            fundsWithdrawn: false
        });

        emit EventCreated(nextEventId, msg.sender, _title, _date, _endDate);
        nextEventId++;
    }

    function buyTicket(uint256 _eventId, uint256 _quantity) external payable {
        Event storage myEvent = events[_eventId];
        require(myEvent.date > block.timestamp, "Event has passed");
        require(!myEvent.isCanceled, "Event is canceled");
        require(myEvent.soldCount + _quantity <= myEvent.capacity, "Not enough tickets left");
        require(msg.value == myEvent.price * _quantity, "Incorrect Ether sent");
        require(_quantity > 0, "Must buy at least 1 ticket");

        tickets[_eventId][msg.sender] += _quantity;
        myEvent.soldCount += _quantity;

        emit TicketPurchased(_eventId, msg.sender, _quantity);
    }

    function cancelEvent(uint256 _eventId) external {
        Event storage myEvent = events[_eventId];
        require(msg.sender == myEvent.organizer, "Only organizer can cancel");
        require(!myEvent.isCanceled, "Event already canceled");
        require(myEvent.date > block.timestamp, "Event has already started");
        // We allow canceling even if past date? Likely yes, to unblock refunds if it never happened.

        myEvent.isCanceled = true;
        emit EventCanceled(_eventId);
    }

    function requestRefund(uint256 _eventId) external {
        Event storage myEvent = events[_eventId];
        uint256 userTicketCount = tickets[_eventId][msg.sender];
        require(userTicketCount > 0, "No tickets to refund");

        bool canRefund = false;
        
        if (myEvent.isCanceled) {
            canRefund = true;
        } else {
            // Refund allowed if requested 24 hours before the event
            if (block.timestamp < myEvent.date - 1 days) {
                canRefund = true;
            }
        }

        require(canRefund, "Refund not allowed (Time limit passed and not canceled)");

        uint256 refundAmount = userTicketCount * myEvent.price;
        
        // Reset state before transfer to prevent re-entrancy
        tickets[_eventId][msg.sender] = 0;
        myEvent.soldCount -= userTicketCount;

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Refund transfer failed");

        emit RefundIssued(_eventId, msg.sender, refundAmount);
    }

    function withdrawFunds(uint256 _eventId) external {
        Event storage myEvent = events[_eventId];
        require(msg.sender == myEvent.organizer, "Only organizer can withdraw");
        require(!myEvent.isCanceled, "Event is canceled, cannot withdraw");
        require(block.timestamp > myEvent.endDate, "Event has not ended yet");
        require(!myEvent.fundsWithdrawn, "Funds already withdrawn");

        uint256 amount = myEvent.soldCount * myEvent.price;
        require(amount > 0, "No funds to withdraw");

        myEvent.fundsWithdrawn = true;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit FundsWithdrawn(_eventId, msg.sender, amount);
    }
}
