import requests
import base64
import json
from os import environ as env
from urlparse import urljoin

EXTERNAL_ROUTER = env['EXTERNAL_ROUTER']
EXTERNAL_SCHEME = env['EXTERNAL_SCHEME']
BASE_URL = '%s://%s' % (EXTERNAL_SCHEME, EXTERNAL_ROUTER)

def b64_decode(data):
    missing_padding = (4 - len(data) % 4) % 4
    if missing_padding:
        data += b'='* missing_padding
    return base64.decodestring(data)

if 'APIGEE_TOKEN1' in env:
    TOKEN1 = env['APIGEE_TOKEN1']
else:
    with open('token.txt') as f:
        TOKEN1 = f.read()
claims = json.loads(b64_decode(TOKEN1.split('.')[1]))
USER1 = claims['iss'] + '#' + claims['sub']

if 'APIGEE_TOKEN2' in env:
    TOKEN2 = env['APIGEE_TOKEN2']
else:
    with open('token2.txt') as f:
        TOKEN2 = f.read()
claims = json.loads(b64_decode(TOKEN2.split('.')[1]))
USER2 = claims['iss'] + '#' + claims['sub']

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
claims = json.loads(b64_decode(TOKEN3.split('.')[1]))
USER3 = claims['iss'] + '#' + claims['sub']

def main():
    
    # DELETE customer

    acme_url = urljoin(BASE_URL, '/customers;acme') 

    headers = {'Content-Type': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.delete(acme_url, headers=headers)
    if r.status_code == 200:
        print 'correctly deleted customer %s ' % (r.headers['Location'])
    else:
        if r.status_code == 404:
            print 'customer %s not present' % acme_url
        else:
            print 'failed to delete customer %s %s %s' % (acme_url, r.status_code, r.text)
            return

    # POST customer

    customer = {
        'isA': 'Customer',
        'name': 'acme',
        'initialCustomerAdmin': USER1
    }

    customers_url = urljoin(BASE_URL, '/customers') 

    headers = {'Content-Type': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.post(customers_url, headers=headers, json=customer)
    if r.status_code == 201:
        print 'correctly created customer %s ' % (r.headers['Location'])
        acme_url = urljoin(BASE_URL, r.headers['Location'])
    else:
        print 'failed to create customer %s %s %s' % (customers_url, r.status_code, r.text)
        return

    # GET customer

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(acme_url, headers=headers)
    if r.status_code == 200:
        acme_url2 = urljoin(BASE_URL, r.headers['Content-Location'])
        if acme_url == acme_url2:
            customer = r.json()
            print 'correctly retrieved customer: %s etag: %s' % (acme_url, r.headers['etag'])
        else:
            print 'retrieved customer at %s but Content-Location is wrong: %s' % (acme_url, customer_url2)
            return
    else:
        print 'failed to retrieve customer %s %s %s' % (acme_url, r.status_code, r.text)
        return
        
if __name__ == '__main__':
    main()