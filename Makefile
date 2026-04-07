# Docker Compose file paths
DEV_COMPOSE  := docker/dev/docker-compose.yml
PROD_COMPOSE := docker/prod/docker-compose.yml

.PHONY: dev-up dev-down dev-logs prod-build prod-up prod-down prod-logs clean help

## Development (infrastructure only)
dev-up:
	docker compose -f $(DEV_COMPOSE) up -d

dev-down:
	docker compose -f $(DEV_COMPOSE) down

dev-logs:
	docker compose -f $(DEV_COMPOSE) logs -f

## Production (full stack)
prod-build:
	docker compose -f $(PROD_COMPOSE) build

prod-up:
	docker compose -f $(PROD_COMPOSE) up -d --build

prod-down:
	docker compose -f $(PROD_COMPOSE) down

prod-logs:
	docker compose -f $(PROD_COMPOSE) logs -f

## Cleanup
clean:
	docker compose -f $(DEV_COMPOSE) down -v
	docker compose -f $(PROD_COMPOSE) down -v --rmi local

## Help
help:
	@echo "Development:"
	@echo "  make dev-up      Start infrastructure (PostgreSQL, Redis, MinIO)"
	@echo "  make dev-down    Stop infrastructure"
	@echo "  make dev-logs    Follow infrastructure logs"
	@echo ""
	@echo "Production:"
	@echo "  make prod-build  Build production images"
	@echo "  make prod-up     Build and start full stack"
	@echo "  make prod-down   Stop full stack"
	@echo "  make prod-logs   Follow production logs"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean       Remove all containers, volumes, and local images"
