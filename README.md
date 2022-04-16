# NFT Notification Bot
A simple bot that pulls the floor price from both OpenSea and LooksRare. Also supports saving FP history to a MySQL DB.
## Features
- Notifies floor price change within 10 seconds
- Saves historical floor price data to a MySQL/MariaDB database (optional)
- Displays historical data on a graph (optional)
## Instructions
Setting up this bot is very easy!
1. Install [node.js](https://nodejs.org/en/download/) LTS/latest if you don't have it installed yet
2. Clone the repo (`git clone https://github.com/MooCowGalaxy/nft-notification-bot`)
3. Install dependencies (`cd nft-notification-bot && npm i`)
4. Copy `config.json.example` to `config.json` and edit the values to your needs
5. Run it (`node index.js`)

And you're done!