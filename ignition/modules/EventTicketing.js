import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("EventTicketingModule", (m) => {
    const eventTicketing = m.contract("EventTicketing");

    return { eventTicketing };
});
