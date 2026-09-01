import urllib.request
import urllib.error
import json

u = 'http://127.0.0.1:5000/model/metrics'
print('GET', u)
try:
    r = urllib.request.urlopen(u)
    data = json.load(r)
    print(json.dumps(data, indent=2))
except urllib.error.HTTPError as e:
    print('HTTPError', e.code)
    try:
        body = e.read().decode(errors='replace')
        print(body)
    except Exception as ex:
        print('failed reading body', ex)
except Exception as e:
    print('Error', e)
