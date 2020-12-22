# Examples

Containing alternative docker compose configuration files.

## docker-compose-hyperledger-example.yml
Uses the docker image hyperledger/iroha:latest according to their [documentation](https://iroha.readthedocs.io/en/stable/getting_started/index.html).

Start the containers (expected to be executed within the folder `iroha-explorer/`):
```
sudo PWD=${PWD} docker-compose -f example/docker-compose-hyperledger-example.yml up -d
```

Explorer UI located at: http://172.29.101.100:3929

Stop the containers:
```
sudo docker-compose -f example/docker-compose-hyperledger-example.yml down
```

Stop the containers and **remove** all data:
```
sudo docker-compose -f example/docker-compose-hyperledger-example.yml down --volumes
```

## Contact the Developers

On [DIVA.EXCHANGE](https://www.diva.exchange) you'll find various options to get in touch with the team. 

Talk to us via Telegram [https://t.me/diva_exchange_chat_de]() (English or German).

## Donations

Your donation goes entirely to the project. Your donation makes the development of DIVA.EXCHANGE faster.

XMR: 42QLvHvkc9bahHadQfEzuJJx4ZHnGhQzBXa8C9H3c472diEvVRzevwpN7VAUpCPePCiDhehH4BAWh8kYicoSxpusMmhfwgx

BTC: 3Ebuzhsbs6DrUQuwvMu722LhD8cNfhG1gs

Awesome, thank you!
