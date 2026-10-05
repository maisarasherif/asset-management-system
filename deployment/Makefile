# Install this file and deploy.sh together in /home/pms/ams-deploy.
# Keep deployment tools outside the production checkout.
DEPLOY_DIR := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
REPO_DIR ?= /home/pms/asset-management-system
BRANCH ?= certgen
EXPECTED_COMMIT ?=

BACKEND_DEST ?= /opt/ams-server/ams-server
FRONTEND_DEST ?= /var/www/ams
SERVICE_NAME ?= ams-server
SERVICE_USER ?= ams
SERVICE_ENV ?= /opt/ams-server/.env
SERVICE_WORKDIR ?= /opt/ams-server
NGINX_USER ?= nginx
VITE_API_URL ?= /api
# Empty selects PORT from SERVICE_ENV, falling back to the app default 8080.
HEALTH_URL ?=

DB_USER ?= ams
MIGRATION_DATABASE_URL ?= postgres://ams@/ams_db?host=/var/run/postgresql&sslmode=disable
BASE_VERSION ?= 49
TARGET_VERSION ?= 54
BACKUP_ROOT ?= $(DEPLOY_DIR)/backups

export DEPLOY_DIR REPO_DIR BRANCH EXPECTED_COMMIT BACKEND_DEST FRONTEND_DEST
export SERVICE_NAME SERVICE_USER SERVICE_ENV SERVICE_WORKDIR NGINX_USER
export VITE_API_URL HEALTH_URL DB_USER MIGRATION_DATABASE_URL
export BASE_VERSION TARGET_VERSION BACKUP_ROOT

.DEFAULT_GOAL := help
.NOTPARALLEL:
.PHONY: deploy deploy-backend deploy-frontend pull build preflight migration-status verify status logs help

## deploy             Fetch certgen, build both, stop, back up, migrate to 54, publish, verify
## deploy-backend     Build/publish backend only; requires database already at 54
## deploy-frontend    Build/publish frontend only; requires database already at 54
## pull               Fetch selected branch and select its commit; preserve local ignored files
## build              Build both applications without publishing or migrating
## preflight          Check service/configuration/tools/database without changing production
## migration-status   Show the current migration version
## verify             Check service, database version and backend health
## status             Show current service status
## logs               Follow backend logs
deploy deploy-backend deploy-frontend pull build preflight migration-status verify status logs:
	@bash "$(DEPLOY_DIR)/deploy.sh" "$@"

## help               Show available targets; overrides: ams deploy BRANCH=certgen
help:
	@printf 'Usage: ams <target> [NAME=value ...]\n\n'
	@sed -n 's/^## /  /p' "$(DEPLOY_DIR)/Makefile"
