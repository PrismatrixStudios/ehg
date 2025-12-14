const { Client, GatewayIntentBits } = require('discord.js');
const { google } = require('googleapis');
const http = require('http');

// Environment variables
const DISCORD_TOKEN = process.env.TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const SPREADSHEET_ID = process.env.SHEET_ID;
const PORT = process.env.PORT || 3000;
const PREFIX = process.env.PREFIX || '!';

// Debug environment variables
console.log('DISCORD_TOKEN:', DISCORD_TOKEN ? 'Loaded' : 'Missing');
console.log('CHANNEL_ID:', CHANNEL_ID || 'Missing');
console.log('SPREADSHEET_ID:', SPREADSHEET_ID || 'Missing');
console.log('PORT:', PORT);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Google Sheets setup
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// Command handler
const commands = new Map();

// Load commands
const loadCommand = (commandName) => {
  try {
    const command = require(`./commands/${commandName}.js`);
    if (!command || typeof command.execute !== 'function') {
      console.error(`❌ Command ${commandName} is missing execute function`);
      return;
    }
    const cmdName = commandName.toLowerCase();
    commands.set(cmdName, command);
    console.log(`✅ Loaded command: ${cmdName}`);
  } catch (error) {
    console.error(`❌ Failed to load command ${commandName}:`, error.message);
  }
};

// Initialize commands
const commandFiles = ['strike', 'promotion', 'deploymentStartPoll', 'deploymentStart', 'deploymentEnd'];
commandFiles.forEach(loadCommand);

// Register aliases
if (commands.has('deploymentstartpoll')) {
  commands.set('deployment-start-poll', commands.get('deploymentstartpoll'));
  commands.set('dsppoll', commands.get('deploymentstartpoll'));
}
if (commands.has('deploymentstart')) {
  commands.set('deploystart', commands.get('deploymentstart'));
  commands.set('deploy-start', commands.get('deploymentstart'));
}
if (commands.has('deploymentend')) {
  commands.set('deployend', commands.get('deploymentend'));
  commands.set('deploy-end', commands.get('deploymentend'));
}

// Message command handler
client.on('messageCreate', async (message) => {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  // Get the full message content after prefix
  const content = message.content.slice(PREFIX.length).trim();
  
  // Find the command name - check for multi-word commands first
  let commandName = '';
  let argsString = '';
  
  // Sort commands by length (longest first) to match multi-word commands correctly
  const sortedCommandNames = Array.from(commands.keys()).sort((a, b) => b.length - a.length);
  
  for (const cmd of sortedCommandNames) {
    const lowerContent = content.toLowerCase();
    if (lowerContent.startsWith(cmd)) {
      // Check if it's a complete command (followed by space, pipe, or nothing)
      const nextChar = content[cmd.length];
      if (!nextChar || nextChar === ' ' || nextChar === '|') {
        commandName = cmd;
        argsString = content.slice(cmd.length).trim();
        break;
      }
    }
  }
  
  // If no command matched, try simple first word
  if (!commandName) {
    const firstSpace = content.indexOf(' ');
    const firstPipe = content.indexOf('|');
    const firstDelimiter = firstSpace === -1 ? firstPipe : (firstPipe === -1 ? firstSpace : Math.min(firstSpace, firstPipe));
    
    if (firstDelimiter === -1) {
      commandName = content.toLowerCase();
      argsString = '';
    } else {
      commandName = content.slice(0, firstDelimiter).toLowerCase();
      argsString = content.slice(firstDelimiter).trim();
    }
  }

  const command = commands.get(commandName);
  if (!command) {
    return; // Command not found, silently ignore
  }

  console.log(`[Command] Executing: ${commandName} with args: "${argsString}"`);

  try {
    await command.execute(message, argsString, { client, sheets, SPREADSHEET_ID });
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    await message.reply('❌ An error occurred while executing this command.').catch(() => {});
  }
});

// HTTP server for Render port binding
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is running\n');
}).listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  console.log(`📋 Loaded ${commands.size} commands:`, Array.from(commands.keys()).join(', '));
});

client.login(DISCORD_TOKEN);
