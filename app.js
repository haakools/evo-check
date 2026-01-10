#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');
const readline = require('readline');

const execAsync = promisify(exec);

const BASE_URL = 'https://visits.evofitness.no';
const OPERATOR_ID = '5336003e-0105-4402-809f-93bf6498af34';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

class GymTUI {
  constructor() {
    this.locations = [];
    this.selectedLocation = null;
  }

  async fetchLocations() {
    try {
      const { stdout } = await execAsync(
        `curl -s -H "Accept: application/json" "${BASE_URL}/api/v1/locations?operator=${OPERATOR_ID}"`
      );
      
      if (stdout.trim().startsWith('<!DOCTYPE') || stdout.trim().startsWith('<html')) {
        throw new Error('API returned HTML instead of JSON. Check if the URL is correct.');
      }
      
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Failed to fetch locations: ${error.message}`);
    }
  }

  async fetchOccupancy(locationId) {
    try {
      const { stdout } = await execAsync(
        `curl -s -H "Accept: application/json" "${BASE_URL}/api/v1/locations/${locationId}/current"`
      );
      
      if (stdout.trim().startsWith('<!DOCTYPE') || stdout.trim().startsWith('<html')) {
        throw new Error('API returned HTML instead of JSON');
      }
      
      return JSON.parse(stdout);
    } catch (error) {
      throw new Error(`Failed to fetch occupancy: ${error.message}`);
    }
  }

  clearScreen() {
    console.clear();
  }

  drawHeader() {
    console.log(colors.bright + colors.cyan + '╔══════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.bright + colors.cyan + '║' + colors.reset + colors.bright + '          🏋️  EVO FITNESS GYM CHECKER 🏋️          ' + colors.cyan + '║' + colors.reset);
    console.log(colors.bright + colors.cyan + '╚══════════════════════════════════════════════════╝' + colors.reset);
    console.log();
  }

  drawProgressBar(percentage) {
    const barLength = 30;
    const filled = Math.floor(barLength * percentage / 100);
    const empty = barLength - filled;
    
    let color;
    if (percentage >= 100) color = colors.red;
    else if (percentage >= 75) color = colors.yellow;
    else color = colors.green;

    return color + '█'.repeat(filled) + colors.dim + '░'.repeat(empty) + colors.reset;
  }

  getStatusEmoji(percentage) {
    if (percentage >= 100) return '🔴';
    if (percentage >= 75) return '🟡';
    if (percentage >= 50) return '🟠';
    return '🟢';
  }

  getStatusText(percentage) {
    if (percentage >= 100) return 'FULL - Very Busy';
    if (percentage >= 75) return 'BUSY - Limited Space';
    if (percentage >= 50) return 'MODERATE - Some Space';
    return 'AVAILABLE - Plenty of Space';
  }

  displayOccupancy(location, data) {
    this.clearScreen();
    this.drawHeader();

    const current = data.current || 0;
    const percentage = data.percentageUsed || 0;
    const status = this.getStatusEmoji(percentage);
    const statusText = this.getStatusText(percentage);

    console.log(colors.bright + `  Location: ${colors.cyan}${location.name}${colors.reset}`);
    console.log();
    console.log(colors.bright + `  People Now:  ${colors.white}${current}${colors.reset}`);
    console.log(colors.bright + `  Capacity:    ${colors.white}${percentage}%${colors.reset}`);
    console.log();
    console.log(`  [${this.drawProgressBar(percentage)}]`);
    console.log();
    console.log(colors.bright + `  Status: ${status} ${statusText}${colors.reset}`);
    console.log();
    console.log(colors.dim + '─'.repeat(54) + colors.reset);
    console.log();
    console.log('  ' + colors.dim + '[R]efresh  [S]witch Location  [Q]uit' + colors.reset);
    console.log();
  }

  displayLocationList(searchTerm = '') {
    this.clearScreen();
    this.drawHeader();

    console.log(colors.bright + '  Select a location:' + colors.reset);
    console.log();

    const filtered = this.locations.filter(loc => 
      loc.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filtered.length === 0) {
      console.log(colors.yellow + '  No locations found matching "' + searchTerm + '"' + colors.reset);
      console.log();
    } else {
      filtered.forEach((loc, idx) => {
        console.log(`  ${colors.cyan}${idx + 1}.${colors.reset} ${loc.name}`);
      });
      console.log();
    }

    if (searchTerm) {
      console.log(colors.dim + `  Searching for: "${searchTerm}"` + colors.reset);
    }
    
    return filtered;
  }

  async selectLocation() {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      let searchTerm = '';
      let filtered = this.displayLocationList(searchTerm);

      const handleInput = (char) => {
        if (char === '\r' || char === '\n') {
          // Enter pressed
          if (filtered.length === 1) {
            rl.close();
            resolve(filtered[0]);
          }
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          searchTerm = searchTerm.slice(0, -1);
          filtered = this.displayLocationList(searchTerm);
        } else if (char === '\u0003') {
          // Ctrl+C
          rl.close();
          process.exit(0);
        } else if (char >= '0' && char <= '9') {
          const num = parseInt(char);
          if (num > 0 && num <= filtered.length) {
            rl.close();
            resolve(filtered[num - 1]);
          } else {
            searchTerm += char;
            filtered = this.displayLocationList(searchTerm);
          }
        } else if (char.match(/[a-zA-ZæøåÆØÅ\s]/)) {
          searchTerm += char;
          filtered = this.displayLocationList(searchTerm);
        }
      };

      readline.emitKeypressEvents(process.stdin);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      process.stdin.on('keypress', (str, key) => {
        if (key.ctrl && key.name === 'c') {
          process.exit(0);
        }
        handleInput(str);
      });
    });
  }

  async monitorLocation(location) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    let shouldContinue = true;

    const refresh = async () => {
      try {
        const data = await this.fetchOccupancy(location.id);
        this.displayOccupancy(location, data);
      } catch (err) {
        console.error(colors.red + 'Error fetching data: ' + err.message + colors.reset);
      }
    };

    await refresh();

    process.stdin.on('keypress', async (str, key) => {
      if (key.ctrl && key.name === 'c' || key.name === 'q') {
        shouldContinue = false;
        rl.close();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.exit(0);
      } else if (key.name === 'r') {
        await refresh();
      } else if (key.name === 's') {
        shouldContinue = false;
        rl.close();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        await this.run();
      }
    });
  }

  async run() {
    try {
      console.log(colors.dim + 'Loading locations...' + colors.reset);
      this.locations = await this.fetchLocations();
      
      const location = await this.selectLocation();
      await this.monitorLocation(location);
    } catch (err) {
      console.error(colors.red + '\nError: ' + err.message + colors.reset);
      console.error(colors.dim + '\nTroubleshooting:' + colors.reset);
      console.error(colors.dim + '  1. Check your internet connection' + colors.reset);
      console.error(colors.dim + '  2. Verify curl is installed: curl --version' + colors.reset);
      console.error(colors.dim + '  3. Test the API manually:' + colors.reset);
      console.error(colors.dim + `     curl "${BASE_URL}/api/v1/locations?operator=${OPERATOR_ID}"` + colors.reset);
      console.log();
      process.exit(1);
    }
  }
}

// Run the app
const app = new GymTUI();
app.run();
