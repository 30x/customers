export IPADDRESS="127.0.0.1"
export PORT=3008
export COMPONENT="customers"
export SPEEDUP=10
export EXTERNAL_ROUTER="localhost:8080"
export INTERNAL_ROUTER="localhost:8080"
export INTERNAL_SCHEME="http"

source test/local-export-pg-connection-variables.sh
node customers.js