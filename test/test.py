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
USER1 = json.loads(b64_decode(TOKEN1.split('.')[1]))['user_id']

if 'APIGEE_TOKEN2' in env:
    TOKEN2 = env['APIGEE_TOKEN2']
else:
    with open('token2.txt') as f:
        TOKEN2 = f.read()
USER2 = json.loads(b64_decode(TOKEN2.split('.')[1]))['user_id']

if 'APIGEE_TOKEN3' in env:
    TOKEN3 = env['APIGEE_TOKEN3']
else:
    with open('token3.txt') as f:
        TOKEN3 = f.read()
USER3 = json.loads(b64_decode(TOKEN3.split('.')[1]))['user_id']

def main():
    
    # POST customer

    customer = {
        'isA': 'Customer',
        'name': 'acme'
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
    return

    # GET customer

    headers = {'Accept': 'application/json','Authorization': 'Bearer %s' % TOKEN1}
    r = requests.get(namespace_url, headers=headers, json=namespace)
    if r.status_code == 200:
        namespace_url2 = urljoin(BASE_URL, r.headers['Content-Location'])
        if namespace_url == namespace_url2:
            namespace = r.json()
            print 'correctly retrieved namespace: %s etag: %s' % (namespace_url, r.headers['etag'])
        else:
            print 'retrieved namespace at %s but Content-Location is wrong: %s' % (namespace_url, namespace_url2)
            return
    else:
        print 'failed to retrieve namespace %s %s %s' % (namespace_url, r.status_code, r.text)
        return
        
if __name__ == '__main__':
    main()