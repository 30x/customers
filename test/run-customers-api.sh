export IPADDRESS="127.0.0.1"
export PORT=3008
export COMPONENT="customers"
export SPEEDUP=10
export EXTERNAL_SY_ROUTER_HOST="localhost"
export EXTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SY_ROUTER_HOST="localhost"
export INTERNAL_SY_ROUTER_PORT="8080"
export INTERNAL_SCHEME="http"

source test/local-export-pg-connection-variables.sh
node customers.js