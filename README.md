# Hyperledger/Iroha Blockchain Explorer

Explore any Iroha Blockchain (https://iroha.readthedocs.io/en/master/).

## Get Started 

### Docker

At the current level of development (alpha) it is advisable to use the project https://codeberg.org/diva.exchange/diva-dockerized to get a local Iroha Testnet within containers up and running. This Iroha Explorer is easy to use with the Testnet.

Pull the Iroha Explorer Image:
```
docker pull divax/iroha-explorer:latest
```

Adapt the following settings (environment variables, volume and network) to your needs (example as used by the mentioned Testnet project).

If your Testnet is up and running, run the Iroha Explorer:
```
docker run \
  -d 
  --env IP_EXPLORER=127.0.0.1 \
  --env PORT_EXPLORER=3900 \
  --env PATH_BLOCKSTORE_IROHA="/tmp/iroha-blockstore/" \
  --env POSTGRES_HOST_IROHA="p2p-iroha1:5432" \
  -v p2p-iroha1:/tmp/iroha-blockstore:ro \
  --network diva-p2p-net1
  --name iroha-explorer \
  divax/iroha-explorer:latest
```

### Build from Source

The code is in alpha (unstable, prototype stage, yet working). It has been developed on Linux and NodeJS v12.
Therefore it is a requisite to have NodeJS available.

Clone the code into a folder of your choice, like:

```
cd /home/me/my-stuff/
git clone -b master https://codeberg.org/diva.exchange/iroha-explorer.git
cd iroha-explorer
```

Prepare your environment:

* A local IP and PORT is needed to run the Explorer, like 127.0.0.1:3900 (default settings)
* Know the path to your local Iroha Blockstore, accessible to the user executing the NodeJS process. It might be something like `/opt/iroha/data/blockstore/`. It might make a lot of sense to mount the blockstore, like this (execute it as node user, not as root): `mkdir /tmp/iroha-blockstore && sudo mount --bind /opt/iroha/data/blockstore/ /tmp/iroha-blockstore/`.
* The Postgres database of Iroha must be accessible to the NodeJS process. The database must be called "iroha_data". The explorer expects a _read-only_ user called "explorer", password "explorer". Here is a script to achieve this: https://codeberg.org/diva.exchange/iroha/src/branch/develop/database/create-read-only-explorer.sql

Now start the explorer (set the enviroment variables according to your environment):
```
npm i
IP=127.0.0.1 PORT=3900 PATH_BLOCKSTORE_IROHA=/tmp/iroha-blockstore/ POSTGRES_HOST_IROHA=127.0.0.1:5432 node -r esm app/src/main.js
```

## Contact the Developers

On [DIVA.EXCHANGE](https://www.diva.exchange) you'll find various options to get in touch with the team. 

Talk to us via Telegram [https://t.me/diva_exchange_chat_de]() (English or German).

## Donations

Your donation goes entirely to the project. Your donation makes the development of DIVA.EXCHANGE faster.

XMR: 42QLvHvkc9bahHadQfEzuJJx4ZHnGhQzBXa8C9H3c472diEvVRzevwpN7VAUpCPePCiDhehH4BAWh8kYicoSxpusMmhfwgx

BTC: 3Ebuzhsbs6DrUQuwvMu722LhD8cNfhG1gs

Awesome, thank you!
