#Video2Minecraft
Convert videos frame by frame to pixel artworks in minecraft

##Usage
Edit `options.json` to something like where `ip`, `port` and `password` are the rcon credentials of your server
```json
{
    "file": "example.mp4",
    "ip": "127.0.0.1",
    "port": 25575,
    "password": "hunter2",
    "connections": 16,
}
```
then run
```shell
node main.js
```

##Screenshot
[![Cmd](http://i.imgur.com/WXFSybK.png)]()
