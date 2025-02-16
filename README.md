```
# 🎟️ Studying Ticket Bots  

A **Discord ticket bot** designed for learning and practicing the creation of efficient support systems. It offers **customizable categories**, **slash commands**, **inactivity monitoring**, and **automatic ticket archiving**.  

---

## 📌 About the Project  

**Studying Ticket Bots** is an educational project aimed at providing a ticket system for Discord, allowing users to open and manage support tickets within a server.  

### 🔹 Main Features:  
✅ **Automated ticket creation and closure**.  
✅ **Customizable categories**, allowing additions or removals as needed.  
✅ **Inactivity monitoring**, sending alerts before closing a ticket.  
✅ **Reopening archived tickets** using slash commands.  
✅ **Log recording** to track all actions.  

---

## 📥 Installation  

### 1️⃣ Clone the repository  
```bash
git clone https://github.com/your-username/studying-ticket-bots.git
cd studying-ticket-bots
```

### 2️⃣ Install dependencies  
The bot uses **Node.js** and the following libraries:  
- [discord.js](https://www.npmjs.com/package/discord.js) → Interaction with the Discord API.  
- [discord-html-transcripts](https://www.npmjs.com/package/discord-html-transcripts) → Generates ticket transcripts.  
- [dotenv](https://www.npmjs.com/package/dotenv) → Manages environment variables.  
- [pm2](https://www.npmjs.com/package/pm2) → Keeps the bot running continuously.  

Install all dependencies with:  
```bash
npm install discord.js discord-html-transcripts dotenv pm2
```

### 3️⃣ Configure environment variables  
Create a `.env` file in the project root and add:  
```env
TOKEN=your_token_here
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id
CATEGORY_ID=ticket_category_id
CLOSED_CATEGORY_ID=archived_tickets_category_id
SUPORTE_ROLE_ID=support_role_id
LOG_CHANNEL_ID=log_channel_id
```

---

## 🚀 Running the Bot  

### 🔹 Normal mode  
```bash
node index.js
```

### 🔹 With automatic restart (using PM2)  
```bash
pm2 start index.js --name "ticket-bot"
```

---

## 📜 Commands  

- **`/setup`** → Creates the ticket opening panel.  
- **`/reopen [channel]`** → Reopens an archived ticket.  

---

## 🛠 How It Works  

The bot operates as follows:  

1. **Users can open tickets** by selecting categories in the ticket panel.  
2. **Tickets are stored in dedicated channels** for each user.  
3. **The bot monitors activity** in the ticket and sends alerts if there are no interactions.  
4. **Inactive tickets are automatically closed** after a set period.  
5. **Logs are recorded** in a specific channel for administration.  
6. **Archived tickets can be reopened** via the `/reopen` command.  

---

## 📌 Customization  

You can modify the ticket categories in the `config.js` file. Example:  

```js
module.exports = {
    categories: [
        {
            id: "support",
            label: "General Support",
            description: "Need help with something?",
            emoji: "🌐",
            color: "#00ff20"
        },
        {
            id: "report",
            label: "Report & Complaint",
            description: "Found an issue? Report it here.",
            emoji: "🚨",
            color: "#ff0000"
        }
    ],
    ticketCategoryID: process.env.CATEGORY_ID,
    closedCategoryID: process.env.CLOSED_CATEGORY_ID,
    suporteRoleID: process.env.SUPORTE_ROLE_ID,
    logChannelID: process.env.LOG_CHANNEL_ID
};
```

To add more categories, simply copy and modify the objects inside the `categories` array.  
