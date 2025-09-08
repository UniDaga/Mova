const axios = require('axios');
const { ethers } = require('ethers');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m",
  blue: "\x1b[33m"
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`---------------------------------------------`);
    console.log(`     Mova Auto Bot - Airdrop Insiders     `);
    console.log(`---------------------------------------------${colors.reset}`);
    console.log();
  }
};

class MovaFaucetBot {
  constructor() {
    this.wallets = [];
    this.proxies = [];
    this.provider = new ethers.JsonRpcProvider('https://mars.rpc.movachain.com/');
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
    ];
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  saveWallets() {
    try {
      fs.writeFileSync('wallets.json', JSON.stringify(this.wallets, null, 2));
      logger.success('Wallets saved to wallets.json');
    } catch (error) {
      logger.error(`Error saving wallets: ${error.message}`);
    }
  }

  loadProxies() {
    try {
      if (fs.existsSync('proxies.txt')) {
        const data = fs.readFileSync('proxies.txt', 'utf8');
        this.proxies = data.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0);
        logger.info(`Loaded ${this.proxies.length} proxies from proxies.txt`);
      } else {
        logger.warn('proxies.txt not found, running without proxies');
        this.proxies = [];
      }
    } catch (error) {
      logger.error(`Error loading proxies: ${error.message}`);
      this.proxies = [];
    }
  }

  createProxyAgent(proxyString) {
    try {

      let proxyUrl = proxyString;

      if (!proxyString.startsWith('http://') && !proxyString.startsWith('https://')) {
        proxyUrl = `http://${proxyString}`;
      }

      return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
      logger.error(`Invalid proxy format: ${proxyString}`);
      return null;
    }
  }

  getRandomProxy() {
    if (this.proxies.length === 0) return null;
    const proxyString = this.proxies[Math.floor(Math.random() * this.proxies.length)];
    return this.createProxyAgent(proxyString);
  }

  generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase
    };
  }

  async askWalletCount() {
    return new Promise((resolve) => {
      this.rl.question(`${colors.cyan}How many wallets do you want to generate? ${colors.reset}`, (answer) => {
        const count = parseInt(answer);
        if (isNaN(count) || count <= 0) {
          logger.error('Please enter a valid number greater than 0');
          resolve(this.askWalletCount());
        } else {
          resolve(count);
        }
      });
    });
  }

  async askDestinationAddress() {
    return new Promise((resolve) => {
      this.rl.question(`${colors.cyan}Enter destination address to send MARS tokens: ${colors.reset}`, (answer) => {
        if (!ethers.isAddress(answer.trim())) {
          logger.error('Please enter a valid Ethereum address');
          resolve(this.askDestinationAddress());
        } else {
          resolve(answer.trim());
        }
      });
    });
  }

  async generateWallets(count) {
    logger.loading(`Generating ${count} wallets...`);
    
    for (let i = 0; i < count; i++) {
      const wallet = this.generateWallet();
      this.wallets.push(wallet);
      logger.success(`Generated wallet ${i + 1}: ${wallet.address}`);
    }

    this.saveWallets();
    logger.success(`Generated and saved ${count} wallets`);
  }

  async getWalletBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error(`Error getting balance for ${address}: ${error.message}`);
      return '0';
    }
  }

  async sendMarsTokens(privateKey, toAddress, amount) {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);

      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice;

      if (!gasPrice) {
        throw new Error('Could not retrieve gas price from the network.');
      }

      const gasLimit = 21000;
      const gasCost = gasPrice * BigInt(gasLimit);
      
      const amountWei = ethers.parseEther(amount.toString());
      const balance = await this.provider.getBalance(wallet.address);

      if (balance < amountWei + gasCost) {
        throw new Error(`Insufficient balance. Need ${ethers.formatEther(amountWei + gasCost)} MARS, but only have ${ethers.formatEther(balance)} MARS`);
      }

      const tx = {
        to: toAddress,
        value: amountWei,
        gasLimit: gasLimit,
        gasPrice: gasPrice
      };

      logger.loading(`Sending ${amount} MARS from ${wallet.address} to ${toAddress}`);
      const txResponse = await wallet.sendTransaction(tx);
      
      logger.info(`Transaction sent: ${txResponse.hash}`);
      logger.loading('Waiting for confirmation...');
      
      const receipt = await txResponse.wait();
      
      if (receipt.status === 1) {
        logger.success(`✅ Transfer completed! Hash: ${receipt.hash}`);
        logger.info(`Explorer: https://scan.mars.movachain.com/tx/${receipt.hash}`);
        return { success: true, hash: receipt.hash };
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      logger.error(`❌ Transfer failed from ${privateKey.slice(0, 10)}...: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async claimFaucet(wallet, retries = 3) {
    const maxRetries = retries;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const proxy = this.getRandomProxy();
        const userAgent = this.getRandomUserAgent();

        const config = {
          method: 'POST',
          url: 'https://faucet.mars.movachain.com/api/faucet/v1/transfer',
          headers: {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.8',
            'content-type': 'application/json',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Brave";v="140"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'sec-gpc': '1',
            'Referer': 'https://faucet.mars.movachain.com/',
            'User-Agent': userAgent
          },
          data: {
            to: wallet.address
          },
          timeout: 30000
        };

        if (proxy) {
          config.httpsAgent = proxy;
          config.httpAgent = proxy;
        }

        logger.loading(`Claiming faucet for ${wallet.address} (Attempt ${attempt}/${maxRetries})`);
        
        const response = await axios(config);
        
        if (response.data && response.data.error === "200") {
          logger.success(`✅ Faucet claimed successfully for ${wallet.address}`);
          logger.info(`Transaction hash: ${response.data.data}`);
          return { success: true, txHash: response.data.data };
        } else {
          throw new Error(response.data?.err_msg || 'Unknown error');
        }

      } catch (error) {
        logger.error(`❌ Attempt ${attempt} failed for ${wallet.address}: ${error.message}`);
        
        if (attempt === maxRetries) {
          logger.error(`Failed to claim faucet for ${wallet.address} after ${maxRetries} attempts`);
          return { success: false, error: error.message };
        }

        await this.sleep(2000 * attempt);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async countdown(seconds, message) {
    for (let i = seconds; i >= 0; i--) {
      logger.countdown(`${message} ${i}s`);
      await this.sleep(1000);
    }
    process.stdout.write('\n');
  }

  async showMenu() {
    console.log(`\n${colors.cyan}${colors.bold}Choose Your Action :${colors.reset}`);
    console.log(`${colors.white}1. Generate wallets and claim faucet${colors.reset}`);
    console.log(`${colors.white}2. Send MARS tokens to address${colors.reset}`);
    console.log(`${colors.white}3. Check wallet balances${colors.reset}`);
    console.log(`${colors.white}4. Exit${colors.reset}\n`);

    return new Promise((resolve) => {
      this.rl.question(`${colors.cyan}Choose option (1-4): ${colors.reset}`, (answer) => {
        const choice = parseInt(answer);
        if (choice >= 1 && choice <= 4) {
          resolve(choice);
        } else {
          logger.error('Please enter a valid option (1-4)');
          resolve(this.showMenu());
        }
      });
    });
  }

  async checkWalletBalances() {
    if (this.wallets.length === 0) {
      logger.warn('No wallets found in wallets.json');
      return;
    }

    logger.step('Checking wallet balances...');
    let totalBalance = 0;

    for (let i = 0; i < this.wallets.length; i++) {
      const wallet = this.wallets[i];
      logger.loading(`Checking balance for wallet ${i + 1}/${this.wallets.length}`);
      
      const balance = await this.getWalletBalance(wallet.address);
      totalBalance += parseFloat(balance);
      
      logger.info(`${wallet.address}: ${balance} MARS`);
    }

    logger.success(`Total balance across all wallets: ${totalBalance.toFixed(6)} MARS`);
  }

  async sendAllMarsTokens() {
    if (this.wallets.length === 0) {
      logger.warn('No wallets found in wallets.json');
      return;
    }

    const destinationAddress = await this.askDestinationAddress();
    
    logger.step(`Starting to send 0.98 MARS from ${this.wallets.length} wallets to ${destinationAddress}`);
    
    let successCount = 0;
    let failedCount = 0;
    let totalSent = 0;

    for (let i = 0; i < this.wallets.length; i++) {
      const wallet = this.wallets[i];
      logger.step(`Processing wallet ${i + 1}/${this.wallets.length}: ${wallet.address}`);

      const balance = await this.getWalletBalance(wallet.address);
      const balanceNum = parseFloat(balance);

      if (balanceNum < 0.99) {
        logger.warn(`Wallet ${wallet.address} has insufficient balance: ${balance} MARS (need at least 0.99 MARS)`);
        failedCount++;
        continue;
      }

      const result = await this.sendMarsTokens(wallet.privateKey, destinationAddress, 0.98);
      
      if (result.success) {
        successCount++;
        totalSent += 0.98;
        logger.success(`Sent 0.98 MARS from ${wallet.address}`);
      } else {
        failedCount++;
      }

      if (i < this.wallets.length - 1) {
        await this.countdown(2, 'Next wallet in');
      }
    }

    logger.success(`\n=== TRANSFER SUMMARY ===`);
    logger.info(`Total wallets processed: ${this.wallets.length}`);
    logger.info(`Successful transfers: ${successCount}`);
    logger.info(`Failed transfers: ${failedCount}`);
    logger.info(`Total MARS sent: ${totalSent.toFixed(2)} MARS`);
    logger.info(`Destination: ${destinationAddress}`);
  }

  loadWalletsFromFile() {
    try {
      if (fs.existsSync('wallets.json')) {
        const data = fs.readFileSync('wallets.json', 'utf8');
        this.wallets = JSON.parse(data);
        logger.info(`Loaded ${this.wallets.length} wallets from wallets.json`);
        return true;
      } else {
        logger.warn('wallets.json not found');
        return false;
      }
    } catch (error) {
      logger.error(`Error loading wallets: ${error.message}`);
      return false;
    }
  }

  async run() {
    logger.banner();

    this.loadProxies();

    while (true) {
      const choice = await this.showMenu();
      
      switch (choice) {
        case 1:
          const walletCount = await this.askWalletCount();
          await this.generateWallets(walletCount);
          
          logger.step(`Starting faucet claiming process for ${this.wallets.length} wallets`);
          
          let successCount = 0;
          let failedCount = 0;

          for (let i = 0; i < this.wallets.length; i++) {
            const wallet = this.wallets[i];
            logger.step(`Processing wallet ${i + 1}/${this.wallets.length}: ${wallet.address}`);
            
            const result = await this.claimFaucet(wallet);
            
            if (result.success) {
              successCount++;
            } else {
              failedCount++;
            }

            if (i < this.wallets.length - 1) {
              await this.countdown(5, 'Next claim in');
            }
          }

          break;

        case 2:
          if (!this.loadWalletsFromFile()) {
            logger.error('Cannot send tokens without wallets. Please generate wallets first.');
            break;
          }
          await this.sendAllMarsTokens();
          break;

        case 3:
          if (!this.loadWalletsFromFile()) {
            logger.error('Cannot check balances without wallets. Please generate wallets first.');
            break;
          }
          await this.checkWalletBalances();
          break;

        case 4:
          logger.success('Thank you for using Mova Auto Bot!');
          this.rl.close();
          process.exit(0);
      }
    }
  }
}

const bot = new MovaFaucetBot();
bot.run().catch(console.error);
