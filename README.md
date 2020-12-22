# Hyperledger/Iroha Blockchain Explorer

Explore any Iroha Blockchain (https://iroha.readthedocs.io/en/master/).

Demo of the DIVA Iroha Blockchain explorer: https://testnet.diva.exchange

## Get Started 

### Docker Compose

To start a preconfigured local Iroha make sure you have "Docker Compose" installed (https://docs.docker.com/compose/install/). Check your Docker Compose installation by executing `docker-compose --version` in a terminal.

Clone the code into a folder of your choice, like:
```
git clone -b master --depth=1 https://codeberg.org/diva.exchange/iroha-explorer.git
cd iroha-explorer
```

Start the local testnet and the explorer:
```
sudo docker-compose up -d
```

Now access the user interface of the explorer on http://localhost:3929. The port 3929 got exposed through the configuration file "docker-compose.yml". Adapt the configuration to your local needs.

Stop the local testnet and the explorer:
```
sudo docker-compose down --volumes
```

### More Examples

Find additional examples to use with docker compose within the folder `example`.

### Build from Source

The explorer has been developed on Linux and NodeJS v12. Therefore it is a requisite to have NodeJS available.

Clone the code into a folder of your choice, like:

```
git clone -b master --depth=1 https://codeberg.org/diva.exchange/iroha-explorer.git
cd iroha-explorer
```

Prepare your environment (prerequisites):

* Iroha postgres database must be accessible to the explorer process
* Iroha blockstore must be accessible to the explorer process
* By default, the explorer will run on 0.0.0.0:3920

Take a close look at `./docker-compose.yml`. Within this docker-compose configuration file the prerequisites are fulfilled by defining a local Iroha testnet.    

Install and start the explorer using npm:
```
npm i
npm start
```

## Contact the Developers

On [DIVA.EXCHANGE](https://www.diva.exchange) you'll find various options to get in touch with the team. 

Talk to us via Telegram [https://t.me/diva_exchange_chat_de]() (English or German).

## Donations

Your donation goes entirely to the project. Your donation makes the development of DIVA.EXCHANGE faster.

XMR: 42QLvHvkc9bahHadQfEzuJJx4ZHnGhQzBXa8C9H3c472diEvVRzevwpN7VAUpCPePCiDhehH4BAWh8kYicoSxpusMmhfwgx

BTC: 3Ebuzhsbs6DrUQuwvMu722LhD8cNfhG1gs

Awesome, thank you!
