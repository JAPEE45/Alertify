
import urllib.request
try:
    req = urllib.request.Request('https://alertifyserver.onrender.com/api/helmet', data=b'{\"helmet\":true}', headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    print(res.read())
except Exception as e:
    print(e)

