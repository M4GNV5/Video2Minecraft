var net = require("net");

module.exports = function(options, callback)
{
    var rcons = [];
    init(0);
    function init(i)
    {
        rcons[i] = new Rcon(options.ip, options.port);
        rcons[i].auth(options.password, function(err)
        {
            if(err)
                return callback(err);

            if(i < options.connections)
                init(i + 1);
            else
                callback(null, {place: placeBlocks, close: close});
        });
    }

    function close()
    {
        rcons.forEach(function(rcon)
        {
            rcon.close();
        });
    }

    function placeBlocks(blocks, callback)
    {
        var commands = [];
        var min = {x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER, z: Number.MAX_SAFE_INTEGER};
        var max = {x: Number.MIN_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER, z: Number.MIN_SAFE_INTEGER};
        for(var i = 0; i < blocks.length; i++)
        {
            var cmd = ["setblock", blocks[i].x, blocks[i].y, blocks[i].z, blocks[i].tagName, blocks[i].data, "replace"].join(" ");
            commands.push(cmd);

            min.x = Math.min(min.x, blocks[i].x);
            min.y = Math.min(min.y, blocks[i].y);
            min.z = Math.min(min.z, blocks[i].z);

            max.x = Math.max(max.x, blocks[i].x);
            max.y = Math.max(max.y, blocks[i].y);
            max.z = Math.max(max.z, blocks[i].z);
        }

        var clearCmd = "fill {0} {1} {2} {3} {4} {5} air"
            .format(min.x, min.y, min.z, max.x, max.y, max.z);
        var count = rcons.length;

        rcons[0].command(clearCmd, function(err, res)
        {
            if(err)
                return callback(err);

            if(options.clear)
                return callback();

        	var size = Math.floor(commands.length / count);
        	var index = 0;

        	for(var i = 0; i < rcons.length - 1; i++)
        	{
        		sendCommands(rcons[i], commands.slice(index, index + size));
        		index += size;
        	}
        	sendCommands(rcons[rcons.length - 1], commands.slice(index));
        });

    	function sendCommands(rcon, cmds)
    	{
            next(0);
            function next(i)
            {
                rcon.command(cmds[i], function(err, res)
                {
                    if(err)
                        return callback(err);

                    if(res == "An unknown error occurred while attempting to perform this command") //minecraft is weird sometimes
                    {
                        next(i);
                        return;
                    }

                    i++;
                    if(i < cmds.length)
                    {
                        next(i);
                    }
                    else
                    {
                        count--;
                        if(count <= 0)
                            callback();
                    }
                });
            }
    	}
    };
}

function Rcon(ip, port)
{
    var self = this;
    self.nextId = 0;
    self.connected = false;
    self.authed = false;
    self.packages = [];

    self.socket = net.connect(port, ip, function()
    {
        self.connected = true;
    });
    self.socket.on("data", function(data)
    {
        var length = data.readInt32LE(0);
        var id = data.readInt32LE(4);
        var type = data.readInt32LE(8);
        var response = data.toString("ascii", 12, data.length - 2);

        if(self.packages[id])
        {
            self.packages[id](type, response);
        }
        else
        {
            console.log("unexpected rcon response", id, type, response);
        }
    });
}
Rcon.timeout = 5000;

Rcon.prototype.close = function()
{
    this.socket.end();
}

Rcon.prototype.auth = function(pw, cb)
{
    var self = this;

    if(self.authed)
        throw new Error("already authed");

    if(self.connected)
        doAuth();
    else
        self.socket.on("connect", doAuth);

    function doAuth()
    {
        self.sendPackage(3, pw, cb);
    }
};

Rcon.prototype.command = function(cmd, cb)
{
    this.sendPackage(2, cmd, cb);
};

Rcon.prototype.sendPackage = function(type, payload, cb)
{
    var self = this;
    var id = self.nextId;
    self.nextId++;

    if(!self.connected)
        throw new Error("Cannot send package while not connected");

    var length = 14 + payload.length;
    var buff = new Buffer(length);
    buff.writeInt32LE(length - 4, 0);
    buff.writeInt32LE(id, 4);
    buff.writeInt32LE(type, 8);

    buff.write(payload, 12);
    buff.writeInt8(0, length - 2);
    buff.writeInt8(0, length - 1);

    self.socket.write(buff);

    var timeout = setTimeout(function()
    {
        delete self.packages[id];
        cb(new Error("Server sent no response in " + Rcon.timeout / 1000 + " seconds"));
    }, Rcon.timeout);

    self.packages[id] = function(type, response)
    {
        clearTimeout(timeout);
        var err = type >= 0 ? false : new Error("Server sent package code " + type);
        cb(err, response, type);
    }
}
