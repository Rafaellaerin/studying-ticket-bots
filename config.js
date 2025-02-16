module.exports = {
    categories: [
        {
            id: "support",
            label: "General Support",
            description: "Have any questions?",
            emoji: "🌐",
            color: "#00ff20"
        },
        {
            id: "report",
            label: "Report & Complaint",
            description: "Found an issue? Want to report something?",
            emoji: "🚨",
            color: "#ff0000"
        },
        {
            id: "partnership",
            label: "Partnership",
            description: "Become our official partner",
            emoji: "🤝",
            color: "#ffaa00"
        }
    ],

    // ====== CATEGORY CONFIGURATION ======

    // ID of the category where new tickets will be created
    ticketCategoryID: process.env.CATEGORY_ID,

    // ID of the category where closed or archived tickets will be moved
    closedCategoryID: process.env.CLOSED_CATEGORY_ID,

    // ====== ROLE CONFIGURATION ======

    // Support role ID (used to mention support team members)
    suporteRoleID: process.env.SUPORTE_ROLE_ID,

    // ====== LOG CHANNEL CONFIGURATION ======

    // ID of the channel where ticket logs will be sent
    logChannelID: process.env.LOG_CHANNEL_ID 
};
