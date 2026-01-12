"use client";
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';

export default function Home() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [events, setEvents] = useState([]);
  const [myTickets, setMyTickets] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('events'); // events, create, tickets
  const [balance, setBalance] = useState("0");
  const [ticketQuantities, setTicketQuantities] = useState({}); // eventId -> quantity

  // Create Event Form
  const [form, setForm] = useState({ title: '', price: '0', date: '', endDate: '', capacity: '100' });
  const [errors, setErrors] = useState({});
  const [notification, setNotification] = useState(null); // { message, type: 'error'|'success' }
  const [isExiting, setIsExiting] = useState(false);

  const showNotification = (message, type = 'info') => {
    setIsExiting(false);
    setNotification({ message, type });
    setTimeout(() => setIsExiting(true), 4500);
    setTimeout(() => setNotification(null), 4900);
  };

  const handleError = (err) => {
    const isUserRejection = err.message && (err.message.includes("user rejected") || err.code === 4001 || (err.info && err.info.error && err.info.error.code === 4001));

    if (isUserRejection) {
      showNotification("Transaction rejected by user", "error");
      return;
    }

    console.error(err);
    const msg = err.reason || (err.info && err.info.error && err.info.error.message) || err.message || "An unexpected error occurred";
    showNotification(msg.length > 100 ? "Transaction failed. Check console." : msg, "error");
  };

  // Helper to clear errors on change
  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }
  };

  // Real-time status updates
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isMetaMaskMissing, setIsMetaMaskMissing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000); // Update every minute
    if (typeof window !== 'undefined' && !window.ethereum) {
      setIsMetaMaskMissing(true);
    }
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accs) => {
        setAccount(accs[0]);
        if (accs[0]) {
          updateContractSigner();
          // Update balance for new account
          const provider = new ethers.BrowserProvider(window.ethereum);
          provider.getBalance(accs[0]).then(bal => setBalance(ethers.formatEther(bal)));
        }
      });
    }
  }, []);

  useEffect(() => {
    if (account) {
      updateContractSigner();
    }
  }, [account]);

  useEffect(() => {
    if (contract) {
      loadEvents();
    }
  }, [contract]);

  async function updateContractSigner() {
    if (!window.ethereum) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    setContract(c);
  }

  async function connectWallet() {
    if (!window.ethereum) return alert("Install Metamask!");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setAccount(accounts[0]);

    const bal = await provider.getBalance(accounts[0]);
    setBalance(ethers.formatEther(bal));

    await updateContractSigner();
  }

  async function loadEvents() {
    if (!contract) return;
    setLoading(true);
    try {
      const nextId = await contract.nextEventId();
      const loadedEvents = [];
      const ticketsOwned = {};

      for (let i = 0; i < Number(nextId); i++) {
        const e = await contract.events(i);
        loadedEvents.push({
          id: i,
          organizer: e.organizer,
          title: e.title,
          price: ethers.formatEther(e.price),
          date: new Date(Number(e.date) * 1000).toLocaleString(),
          rawDate: Number(e.date),
          endDate: new Date(Number(e.endDate) * 1000).toLocaleString(),
          rawEndDate: Number(e.endDate),
          capacity: Number(e.capacity),
          soldCount: Number(e.soldCount),
          isCanceled: e.isCanceled,
          fundsWithdrawn: e.fundsWithdrawn
        });

        const count = await contract.tickets(i, account);
        if (Number(count) > 0) ticketsOwned[i] = Number(count);
      }
      setEvents(loadedEvents);
      setMyTickets(ticketsOwned);
    } catch (err) {
      console.error(err);
      alert("Error loading events: " + err.message);
    }
    setLoading(false);
  }

  async function createEvent() {
    if (!contract) return;

    const newErrors = {};
    if (!form.title) newErrors.title = "Title is required";
    if (!form.price || Number(form.price) <= 0) newErrors.price = "Price must be > 0";
    if (!form.date) newErrors.date = "Start date is required";
    if (!form.endDate) newErrors.endDate = "End date is required";
    if (!form.capacity || Number(form.capacity) <= 0) newErrors.capacity = "Capacity must be > 0";

    // Check if we have basic validation errors before proceeding
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert dates to timestamps
    const dateTimestamp = Math.floor(new Date(form.date).getTime() / 1000);
    const endDateTimestamp = Math.floor(new Date(form.endDate).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);

    // Validate timestamps are valid numbers
    if (isNaN(dateTimestamp)) {
      newErrors.date = "Invalid start date";
    }
    if (isNaN(endDateTimestamp)) {
      newErrors.endDate = "Invalid end date";
    }

    // Only proceed with time-based validation if timestamps are valid
    if (!isNaN(dateTimestamp) && dateTimestamp <= now) {
      newErrors.date = "Start date must be in the future";
    }
    if (!isNaN(endDateTimestamp) && endDateTimestamp <= now) {
      newErrors.endDate = "End date must be in the future";
    }
    if (!isNaN(dateTimestamp) && !isNaN(endDateTimestamp) && endDateTimestamp <= dateTimestamp) {
      newErrors.endDate = "End date must be after start date";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const tx = await contract.createEvent(
        form.title,
        ethers.parseEther(form.price.toString()),
        dateTimestamp,
        endDateTimestamp,
        Number(form.capacity)
      );
      await tx.wait();
      showNotification("Event created successfully!", "success");
      setForm({ title: '', price: '0', date: '', endDate: '', capacity: '100' });
      setErrors({});
      loadEvents();
      setActiveTab('events');
    } catch (err) {
      handleError(err);
    }
  }

  async function buyTicket(eventId, price, quantity = 1) {
    if (!contract) return;

    const event = events.find(e => e.id === eventId);
    if (event && quantity > (event.capacity - event.soldCount)) {
      showNotification(`Only ${event.capacity - event.soldCount} tickets left!`, "error");
      return;
    }

    try {
      const priceInWei = ethers.parseEther(price.toString());
      const totalWei = priceInWei * BigInt(quantity);
      const tx = await contract.buyTicket(eventId, quantity, { value: totalWei });
      await tx.wait();
      showNotification(`Successfully bought ${quantity} ticket(s)!`, "success");
      loadEvents();
      if (account && window.ethereum) { // Refresh balance
        const provider = new ethers.BrowserProvider(window.ethereum);
        const bal = await provider.getBalance(account);
        setBalance(ethers.formatEther(bal));
      }
    } catch (err) {
      const msg = err.reason || (err.info && err.info.error && err.info.error.message) || err.message || "";
      if (msg.includes("Internal JSON-RPC error") || err.code === -32603) {
        showNotification("Transaction failed. You may have a pending transaction or insufficient funds.", "error");
      } else {
        handleError(err);
      }
    }
  }

  async function requestRefund(eventId) {
    if (!contract) return;
    try {
      const tx = await contract.requestRefund(eventId);
      await tx.wait();
      showNotification("Refund processed successfully!", "success");
      loadEvents();
    } catch (err) {
      handleError(err);
    }
  }

  async function cancelEvent(eventId) {
    if (!contract) return;
    try {
      const tx = await contract.cancelEvent(eventId);
      await tx.wait();
      showNotification("Event Canceled successfully!", "success");
      loadEvents();
    } catch (err) {
      const msg = err.reason || (err.info && err.info.error && err.info.error.message) || err.message || "";
      if (msg.includes("Event has passed") || msg.includes("Event has already started")) {
        showNotification("Cannot cancel event: Event has already started", "error");
      } else {
        handleError(err);
      }
    }
  }

  async function withdrawFunds(eventId) {
    if (!contract) return;
    try {
      const tx = await contract.withdrawFunds(eventId);
      await tx.wait();
      showNotification("Funds Withdrawn successfully!", "success");
      loadEvents();
    } catch (err) {
      handleError(err);
    }
  }

  const getEventStatus = (event) => {
    if (event.isCanceled) return { label: 'CANCELED', class: 'badge-red' };

    const now = new Date().getTime() / 1000;

    // Check Ended
    if (now > event.rawEndDate) return { label: 'ENDED', class: 'badge-gray' };

    // Check In Progress
    if (now >= event.rawDate && now <= event.rawEndDate) return { label: 'IN PROGRESS', class: 'badge-blue' };

    // Check Sold Out (Only if not started/ended)
    if (event.soldCount >= event.capacity) return { label: 'SOLD OUT', class: 'badge-orange' };

    return null; // Upcoming (default, no badge or maybe 'UPCOMING')
  };

  return (
    <div className="container">
      {notification && (
        <div className={isExiting ? "notification-exit" : "notification-enter"} style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '16px 24px',
          background: notification.type === 'error' ? 'rgba(255, 77, 79, 0.95)' : 'rgba(82, 196, 26, 0.95)',
          color: 'white',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 1000,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '1.2rem' }}>{notification.type === 'error' ? '⚠️' : '✅'}</span>
          <span>{notification.message}</span>
        </div>
      )}

      {isMetaMaskMissing && (
        <div style={{ background: 'var(--error)', color: 'white', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', textAlign: 'center' }}>
          ⚠️ MetaMask is not installed. Please <a href="https://metamask.io/" target="_blank" style={{ color: 'white', textDecoration: 'underline' }}>install MetaMask</a> to use this app.
        </div>
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>EventLedger 🎟️</h1>
        {!account ? (
          <button onClick={connectWallet}>Connect Wallet</button>
        ) : (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>{Number(balance).toFixed(4)} GO</span>
            <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
            <button onClick={() => window.location.reload()}>Disconnect</button>
          </div>
        )}
      </header>

      <main style={{ flex: 1, width: '100%' }}>

        {account && (
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button onClick={() => setActiveTab('events')} style={{ background: activeTab === 'events' ? 'var(--primary)' : 'rgba(255,255,255,0.1)' }}>All Events</button>
            <button onClick={() => setActiveTab('create')} style={{ background: activeTab === 'create' ? 'var(--primary)' : 'rgba(255,255,255,0.1)' }}>Create Event</button>
            <button onClick={() => setActiveTab('myEvents')} style={{ background: activeTab === 'myEvents' ? 'var(--primary)' : 'rgba(255,255,255,0.1)' }}>My Events</button>
            <button onClick={() => setActiveTab('tickets')} style={{ background: activeTab === 'tickets' ? 'var(--primary)' : 'rgba(255,255,255,0.1)' }}>My Tickets</button>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="glass-card" style={{ maxWidth: '500px', margin: '0 auto' }}>
            <h2>Create New Event</h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Event Title</label>
              <input
                placeholder="Ex: Summer Music Festival"
                value={form.title}
                onChange={e => handleChange('title', e.target.value)}
                style={{ border: errors.title ? '1px solid var(--error)' : undefined }}
              />
              {errors.title && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{errors.title}</span>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Price (GO)</label>
              <input
                placeholder="Ex: 0.1" type="number" step="0.01"
                value={form.price}
                onChange={e => handleChange('price', e.target.value)}
                style={{ border: errors.price ? '1px solid var(--error)' : undefined }}
              />
              {errors.price && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{errors.price}</span>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Start Date & Time</label>
              <input
                type="datetime-local"
                value={form.date}
                min={new Date().toISOString().slice(0, 16)}
                max="9999-12-31T23:59"
                onChange={e => handleChange('date', e.target.value)}
                style={{ border: errors.date ? '1px solid var(--error)' : undefined }}
              />
              {errors.date && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{errors.date}</span>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>End Date & Time</label>
              <input
                type="datetime-local"
                value={form.endDate}
                min={form.date || new Date().toISOString().slice(0, 16)}
                max="9999-12-31T23:59"
                onChange={e => handleChange('endDate', e.target.value)}
                style={{ border: errors.endDate ? '1px solid var(--error)' : undefined }}
              />
              {errors.endDate && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{errors.endDate}</span>}
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Total Capacity (Tickets)</label>
              <input
                placeholder="Ex: 100" type="number"
                value={form.capacity}
                onChange={e => handleChange('capacity', e.target.value)}
                style={{ border: errors.capacity ? '1px solid var(--error)' : undefined }}
              />
              {errors.capacity && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{errors.capacity}</span>}
            </div>

            <button onClick={createEvent} style={{ width: '100%' }}>Create Event</button>
          </div>
        )}

        {(activeTab === 'events' || activeTab === 'myEvents') && (
          <div className="grid">
            {events.filter(e => activeTab === 'events' || (account && e.organizer.toLowerCase() === account.toLowerCase())).map(event => (
              <div key={event.id} className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>{event.title}</h3>
                  {(() => {
                    const status = getEventStatus(event);
                    return status ? <span className={`badge ${status.class}`}>{status.label}</span> : null;
                  })()}
                </div>
                <p>📅 Start: {event.date}</p>
                <p>🏁 End: {event.endDate}</p>
                <p>💰 {event.price} GO</p>
                <p>🎟️ {event.soldCount} / {event.capacity} Sold</p>
                <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Organizer: {event.organizer.slice(0, 6)}...</p>

                {!event.isCanceled && event.soldCount < event.capacity && new Date().getTime() / 1000 < event.rawDate && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <label style={{ fontSize: '0.9rem' }}>Qty:</label>
                      <input
                        type="number"
                        min="1"
                        max={event.capacity - event.soldCount}
                        value={ticketQuantities[event.id] || 1}
                        onChange={(e) => setTicketQuantities({ ...ticketQuantities, [event.id]: Math.max(1, parseInt(e.target.value) || 1) })}
                        style={{ width: '60px', padding: '0.25rem', marginBottom: 0 }}
                      />
                    </div>
                    <button onClick={() => buyTicket(event.id, event.price, ticketQuantities[event.id] || 1)} style={{ width: '100%' }}>
                      Buy {ticketQuantities[event.id] || 1} Ticket(s)
                    </button>
                  </div>
                )}

                {event.organizer.toLowerCase() === account?.toLowerCase() && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    {!event.isCanceled && !event.fundsWithdrawn && new Date().getTime() / 1000 < event.rawDate && (
                      <button onClick={() => cancelEvent(event.id)} style={{ background: 'var(--error)', fontSize: '0.8rem' }}>Cancel</button>
                    )}
                    {new Date().getTime() / 1000 > event.rawEndDate && !event.fundsWithdrawn && !event.isCanceled && event.soldCount > 0 && (
                      <button onClick={() => withdrawFunds(event.id)} style={{ background: 'var(--success)', fontSize: '0.8rem' }}>Withdraw</button>
                    )}
                  </div>
                )}
              </div>

            ))}
            {activeTab === 'myEvents' && events.filter(e => account && e.organizer.toLowerCase() === account.toLowerCase()).length === 0 && (
              <p style={{ textAlign: 'center', marginTop: '2rem', color: '#aaa', gridColumn: '1 / -1' }}>You haven't created any events yet.</p>
            )}
          </div>
        )}

        {activeTab === 'tickets' && (
          <div className="grid">
            {events.filter(e => myTickets[e.id]).map(event => (
              <div key={event.id} className="glass-card">
                <h3>{event.title}</h3>
                <p>📅 Start: {event.date}</p>
                <p>🏁 End: {event.endDate}</p>
                <div style={{ margin: '1rem 0', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem' }}>
                  <p style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Unit Price:</span>
                    <span>{event.price} GO</span>
                  </p>
                  <p style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Quantity:</span>
                    <span>{myTickets[event.id]}</span>
                  </p>
                  <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                  <p style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)', fontSize: '1.1rem' }}>
                    <span>Total Value:</span>
                    <span>{(Number(event.price) * myTickets[event.id]).toFixed(4)} GO</span>
                  </p>
                </div>

                {(event.isCanceled || (new Date().getTime() / 1000 < event.rawDate - 86400)) && (
                  <button onClick={() => requestRefund(event.id)} style={{ marginTop: '1rem', width: '100%', background: 'var(--accent)' }}>
                    Request Refund 💸
                  </button>
                )}
              </div>
            ))}
            {Object.keys(myTickets).length === 0 && <p>No tickets owned.</p>}
          </div>
        )}
      </main>

      <footer style={{
        textAlign: 'center',
        marginTop: 'auto',
        padding: '1rem',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        fontSize: '0.8rem',
        width: '100%'
      }}>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Sorbonne University</h3>
        <p style={{ margin: '0' }}>M2 Project - Internet of Blockchains</p>
        <p style={{ margin: '0.5rem 0 0 0' }}>Developed by:</p>
        <p style={{ fontWeight: 'bold', margin: '0' }}>Amira ASSAM & Mortada KORTI</p>
        <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.7, margin: '0.5rem 0 0 0' }}>2025-2026</p>
      </footer>
    </div>
  );
}
