const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const readlineSync = require('readline-sync');

const checkBalance = require('./src/checkBalance');
const displayHeader = require('./src/displayHeader');
const sleep = require('./src/sleep');
const {
  loadChains,
  selectChain,
  selectNetworkType,
} = require('./chain/rpc'); // Menggunakan rpc.js

const MAX_DAILY_TRANSACTIONS = 10;
const transactionCounts = {};
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;

async function retry(fn, maxRetries = MAX_RETRIES, delay = RETRY_DELAY) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(colors.yellow(`⚠️ Error occurred. Retrying... (${i + 1}/${maxRetries})`));
      await sleep(delay);
    }
  }
}

const main = async () => {
  displayHeader();

  const networkType = selectNetworkType();
  const chains = loadChains();
  const selectedChain = selectChain(chains);

  console.log(colors.green(`✅ Anda telah memilih: ${selectedChain.name}`));
  console.log(colors.green(`🛠 RPC URL: ${selectedChain.rpcUrl}`));
  console.log(colors.green(`🔗 Chain ID: ${selectedChain.chainId}`));

  const provider = new ethers.JsonRpcProvider(selectedChain.rpcUrl);
  const privateKeys = JSON.parse(fs.readFileSync('privateKeys.json'));

  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const senderAddress = wallet.address;

    if (!transactionCounts[senderAddress]) {
      transactionCounts[senderAddress] = 0;
    }

    if (transactionCounts[senderAddress] >= MAX_DAILY_TRANSACTIONS) {
      console.log(colors.yellow(`📅 Sudah mencapai batas transaksi untuk: ${senderAddress}.`));
      continue;
    }

    console.log(colors.cyan(`💼 Memproses transaksi untuk alamat: ${senderAddress}`));

    let senderBalance;
    try {
      senderBalance = await retry(() => checkBalance(provider, senderAddress));
    } catch (error) {
      console.log(colors.red(`❌ Gagal memeriksa saldo untuk ${senderAddress}.`));
      continue;
    }

    if (senderBalance < ethers.parseUnits('0.0001', 'ether')) {
      console.log(colors.red('❌ Saldo tidak mencukupi.'));
      continue;
    }

    for (let i = 0; i < MAX_DAILY_TRANSACTIONS; i++) {
      const receiverWallet = ethers.Wallet.createRandom();
      const receiverAddress = receiverWallet.address;
      console.log(colors.white(`\n🆕 Alamat yang dihasilkan ${i + 1}: ${receiverAddress}`));

      const amountToSend = ethers.parseUnits((Math.random() * (0.0000001 - 0.00000001) + 0.00000001).toFixed(10), 'ether');

      let gasPrice;
      try {
        gasPrice = (await provider.getFeeData()).gasPrice;
      } catch (error) {
        console.log(colors.red('❌ Gagal mendapatkan gas price.'));
        continue;
      }

      const transaction = {
        to: receiverAddress,
        value: amountToSend,
        gasLimit: 21000,
        gasPrice: gasPrice,
        chainId: parseInt(selectedChain.chainId),
      };

      let tx;
      try {
        tx = await retry(() => wallet.sendTransaction(transaction));
        transactionCounts[senderAddress]++;
      } catch (error) {
        console.log(colors.red(`❌ Gagal mengirim transaksi: ${error.message}`));
        continue;
      }

      console.log(colors.white(`🔗 Transaksi ${i + 1}:`));
      console.log(colors.white(`  Hash: ${colors.green(tx.hash)}`));
      console.log(colors.white(`  Dari: ${colors.green(senderAddress)}`));
      console.log(colors.white(`  Ke: ${colors.green(receiverAddress)}`));
      console.log(colors.white(`  Jumlah: ${colors.green(ethers.formatUnits(amountToSend, 'ether'))} ${selectedChain.symbol}`));
      console.log(colors.white(`  Gas Price: ${colors.green(ethers.formatUnits(gasPrice, 'gwei'))} Gwei`));

      await sleep(15000);
    }

    console.log(colors.green(`✅ Selesai transaksi untuk alamat: ${senderAddress}`));
  }

  console.log(colors.green('Semua transaksi selesai.'));
  console.log(colors.green('Subscribe: https://t.me/HappyCuanAirdrop.'));
  process.exit(0);
};

const startPeriodicProcess = async () => {
  while (true) {
    await main();
    console.log(colors.green('⏳ Menunggu 8 jam sebelum menjalankan lagi...'));
    await sleep(8 * 60 * 60 * 1000);
  }
};

startPeriodicProcess().catch((error) => {
  console.error(colors.red('🚨 Terjadi kesalahan yang tidak terduga:'), error);
  process.exit(1);
});
