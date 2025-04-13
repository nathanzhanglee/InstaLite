# Makefile, if you want

# Variables
NODE_MODULES = node_modules
LOG_FILES = *.log

# Default target
.PHONY: all
all:
	@echo "Available commands:"
	@echo "  make clean       - Remove node_modules and logs"
	@echo "  make install     - Install dependencies"
	@echo "  make clear-logs  - Clear log files"

# Remove node_modules and logs
.PHONY: clean
clean:
	rm -rf $(NODE_MODULES) $(LOG_FILES)
	@echo "Cleaned node_modules and logs."

# Install dependencies
.PHONY: install
install:
	npm install
	@echo "Dependencies installed."
	@source run-chroma.sh
	@echo "Chroma installed."

# Clear log files
.PHONY: clear-logs
clear-logs:
	rm -f $(LOG_FILES)
	@echo "Log files cleared."