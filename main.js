var spawn = require("child_process").spawn;
var fs = require("fs");
var jpeg = require("jpeg-js");
var multiRcon = require("./rcon.js");

String.prototype.format = function()
{
	var val = this;
	for(var i = 0; i < arguments.length; i++)
		val = val.replace(new RegExp("\\{" + i + "\\}", "g"), arguments[i]);
	return val;
};

const colors = [
	[0xDD, 0xDD, 0xDD],
	[0xDB, 0x7D, 0x3E],
	[0xB3, 0x50, 0xBC],
	[0x6B, 0x8A, 0xC9],
	[0xB1, 0xA6, 0x27],
	[0x41, 0xAE, 0x38],
	[0xD0, 0x84, 0x99],
	[0x40, 0x40, 0x40],
	[0x9A, 0xA1, 0xA1],
	[0x2E, 0x6E, 0x89],
	[0x7E, 0x3D, 0xB5],
	[0x2E, 0x38, 0x8D],
	[0x4F, 0x32, 0x1F],
	[0x35, 0x46, 0x1B],
	[0x96, 0x34, 0x30],
	[0x19, 0x16, 0x16]
];

var avconvArgs = "-i {0} -vsync 1 -r {1} -t 3s -an -y -qscale 1 -s {2}x{3} ./frames/%d.jpg";

var options = require("./options.json");
options.file = options.video || "example.mp4";
options.frames = parseInt(options.frames) || 10;
options.width = parseInt(options.width) || 35;
options.height = parseInt(options.height) || 20;

options.block = options.block || "wool";
options.x = parseInt(options.x) || 0;
options.y = parseInt(options.y) || 4;
options.z = parseInt(options.z) || 0;

function displayVideo(frames)
{
	var rcon;
	multiRcon(options, function(err, _rcon)
	{
		if(err)
			throw err;
		rcon = _rcon;
		processFrame(0);
	});

	function processFrame(index)
	{
		var width = frames[index].width;
		var height = frames[index].height;
		var buff = frames[index].data;
		var blocks = [];

		var start = Date.now();
		for(var x = 0; x < width; x++)
		{
			for(var y = 0; y < height; y++)
			{
				var colori = (x + y * width) * 4;
				var red = buff[colori++];
				var green = buff[colori++];
				var blue = buff[colori];

				var smallestDist = 0xFFFFFFF;
				var choosenColor;

				for(var i = 0; i < colors.length; i++)
				{
					var color = colors[i];
					var dist = Math.sqrt(square(red - color[0]) + square(green - color[1]) + square(blue - color[2]));

					if(dist < smallestDist)
					{
						choosenColor = i;
						smallestDist = dist;
					}
				}

				blocks.push({
					x: options.x + width - x,
					y: options.y + height - y,
					z: options.z + index,
					tagName: options.block,
					data: choosenColor
				});
			}
		}

		rcon.place(blocks, function(err)
		{
			if(err)
				throw err;

			console.log("placed frame {0} in {1} seconds - {2} frames to go"
				.format(index, (Date.now() - start) / 1000, frames.length - index - 1));

			index++;
			if(index < frames.length)
				processFrame(index);
			else
				rcon.close();
		});
	}

}

function square(val)
{
	return val * val;
}

fs.mkdir("frames", function(err)
{
	if(err)
		throw err;

	var args = avconvArgs.format(options.file, options.frames, options.width, options.height);
	console.log("avconv " + args);
	var avconv = spawn("avconv", args.split(" "));
	var avconvlog = [];
	avconv.stdout.on("data", function(data)
	{
		avconvlog.push(data.toString());
	});
	avconv.stderr.on("data", function(data)
	{
		avconvlog.push(data.toString());
	});
	avconv.on("close", function(code, signal)
	{
		if(code !== 0)
		{
			console.log(avconvlog.join("\n"));
			if(code)
				console.log("libav exited with code {0}, aborting!".format(code));
			else
				console.log("libav received signal {0}, aborting!".format(signal));

			return;
		}

		fs.readdir("./frames", function(err, files)
		{
			if(err)
				throw err;

			files.sort(function(a, b)
			{
				a = parseInt(a.split(".")[0]);
				b = parseInt(b.split(".")[0]);
				return a - b;
			});

			var count = files.length;
			var frames = new Array(files.length);

			files.forEach(function(file, i)
			{
				fs.readFile("./frames/" + file, function(err, data)
				{
					if(err)
						throw err;

					frames[i] = jpeg.decode(data);

					fs.unlink("./frames/" + file, function(err)
					{
						if(err)
							throw err;

						count--;
						if(count <= 0)
						{
							fs.rmdir("./frames", function(err)
							{
								if(err)
									throw err;

								displayVideo(frames);
							});
						}
					});
				});
			});
		});
	});
});
