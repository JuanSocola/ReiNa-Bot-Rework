const fs = require('fs');
const fsPath = require('fs-path');
const Discord = require('discord.js');
//音樂模塊
const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');
//ffmpeg 導入
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');

//progressbar import
const pb = require('string-progressbar');

//request module
const request = require("request");

ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = class Util {
    constructor(main){
        this.main = main;
        this.youtube = new YouTube(this.main.config.YoutubeAPI);
    }

    //shuffle
    shuffle(a) {
	    for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	    }
	    return a;
	}
    
    //隨機數
    getRandomInt(max){
        return Math.floor(Math.random() * max) + 1;
    }

    //創建Embed範例信息模塊
    createEmbed(author, title, content, url, color, Footer, FooterURL, imgURL){
        author = author || this.main.bot.user;
        title = title || `ReiNa Bot Rework`;
        color = color || `#0099ff`;
        url = url || `https://github.com/MCwindTIM/ReiNa-Bot-Rework`;
        Footer = Footer || `ReiNa By 𝓖𝓻𝓪𝓷𝓭𝓞𝓹𝓮𝓻𝓪𝓽𝓸𝓻#7832`;
		FooterURL = FooterURL || this.main.bot.user.avatarURL();
		imgURL = imgURL || null;
        let embed = new Discord.MessageEmbed()
        .setAuthor(author.tag, author.avatarURL())
        .setColor(color)
        .setTitle(title)
        .setURL(url)
        .setDescription(content)
        .setTimestamp()
        .setFooter(Footer, FooterURL);
		if(imgURL){
			embed.setImage(imgURL);
		}
        return embed;
    }

    //請求 Youtube 播放列表
    getPlaylist(url){
        return this.youtube.getPlaylist(url);
    }

    //請求Youtube 影片
    getVideo(url){
        return this.youtube.getVideo(url);
    }

    //搜尋Youtube 影片
    searchVideos(searchString, item){
        return this.youtube.searchVideos(searchString, item);
    }

    //請求 Youtube 影片
    getYTVideos(playlist){
        return playlist.getVideos();
    }

    //使用Youtube 影片ID 請求影片
    getVideoByID(id){
        return this.youtube.getVideoByID(id);
    }


    //處理Youtube影片
    async handleVideo(video, message, songAuthor, voiceChannel, playlist = false, startTime){
        const serverQueue = this.main.queue.get(message.guild.id);
        startTime = `${startTime}` || `0s`;
        let vdh = video.duration.hours;
        let vdm = video.duration.minutes;
        let vds = video.duration.seconds;
        if(vdh < 10) vdh = `0${vdh}`;
        if(vdm < 10) vdm = `0${vdm}`;
        if(vds < 10) vds = `0${vds}`;

        var song = {
            id: video.id,
            title: Discord.escapeMarkdown(video.title),
            url: `https://www.youtube.com/watch?v=${video.id}`,
            length: video.duration.hours === 0 && video.duration.minutes === 0 && video.duration.seconds === 0 ? `:red_circle: Youtube 直播中` : `${vdh}:${vdm}:${vds}`,
            author: songAuthor,
            guildtag: message.guild.name,
            startFrom: video.duration.hours === 0 && video.duration.minutes === 0 && video.duration.seconds === 0 ? `0s` : startTime,
            live: video.duration.hours === 0 && video.duration.minutes === 0 && video.duration.seconds === 0 ? true : false
        };
        if(!serverQueue){
            const queueConstruct = {
                textChannel: message.channel,
                voiceChannel: voiceChannel,
                connection: null,
                songs: [],
                volume: 1,
                loop: false,
                playing: true
            };
            this.main.queue.set(message.guild.id, queueConstruct);

            queueConstruct.songs.push(song);

            try{
                let connection = await voiceChannel.join();
                connection.voice.setSelfDeaf(true);
                queueConstruct.connection = connection;
                this.play(message.guild, queueConstruct.songs[0]);
            }catch(err){
                console.log(err);
                this.main.queue.delete(message.guild.id);
                let embed = this.createEmbed(songAuthor, `ReiNa Bot Rework 錯誤`, `在進入語音頻道時發生錯誤! 嗚嗚嗚~\n\n\n**此信息將會在5秒後自動刪除**\n`, null, 0xcc0000);
                message.channel.send(embed)
                .then(msg => {
                    msg.delete({timeout: 5000}).catch(console.error);
                }).catch();
                return;
            }
        }else{
            serverQueue.songs.push(song);
            if(playlist) return undefined;
            else{
                let embed = this.createEmbed(songAuthor, null, `✅ 將**${song.title}**加入到播放列表中!\n\n\n**此信息將會在5秒後自動刪除**\n`, null, 0xcc0000);
                message.channel.send(embed)
                .then(msg => {
                    msg.delete({timeout: 5000}).catch(console.error);
                }).catch();
                return;
            }
        }
        return undefined;
    }

    //播放音樂
    play(guild, song){
        //傳入this 到fs.readFile/setPresence function
        
        const serverQueue = this.main.queue.get(guild.id);

        if(!song){
            let noSong = this.createEmbed(null, null, `Senpai, 全部音樂已經播放完畢, 這裡就沒有我的事情了 需要我的時候再叫我吧!\n\n\n**此信息將會在5秒後自動刪除**\n`, null, 0xcc0000);
            serverQueue.textChannel.send(noSong)
            .then(msg => {
				msg.delete({timeout: 5000}).catch(console.error);
			}).catch();
            serverQueue.voiceChannel.leave();
            this.main.queue.delete(guild.id);
            this.main.util.setActivity(this.main);
            try{
                this.main.musictimer.delete(guild.id);
            }catch(e){}
            return;
        }

        let dispatcher;
        //Check video is live or not
        if(song.live){
            //youtube live (always dont cache)
            dispatcher = serverQueue.connection.play(ytdl(song.url, {filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1<<25 }))
            .on('finish', end => {
                if(serverQueue.loop == false){serverQueue.songs.shift();}
                else {
                    if(serverQueue.loop == true){
                        serverQueue.songs.unshift(serverQueue.songs[0]);
                        serverQueue.songs.shift();
                    }
                }
                this.play(guild, serverQueue.songs[0]);
                this.main.musictimer.set(guild.id, Date.now());
            })
            .on('error', e => console.trace(e));
            dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
            let embed = this.createEmbed(song.author, null, `🎶 開始播放: <@${song.author.id}>添加的**${song.title}**\n\n語音頻道: **${serverQueue.songs[0].guildtag}的${serverQueue.voiceChannel.name}**\n\n\n**此信息將會在5秒後自動刪除**\n`);
            serverQueue.textChannel.send(embed)
                .then(msg => {
                msg.delete({timeout: 5000}).catch(console.error);
                }).catch();
            let looping = '';
            (serverQueue.loop == true) ? looping = "開啟" : looping = "關閉";
            this.main.util.setActivity(this.main, { string: `正在播放: ${song.title} 由 ${song.author.tag}, ||[單曲循環播放: ${looping}]||`, type: 2});
            this.main.musictimer.set(guild.id, Date.now());
            
        }else{
            //youtube video cache
            fs.readFile.call(this, `./MusicCache/${song.id}.mp3`, { encoding: 'utf-8'}, (err, data) => {
                if(!err){
                    let size = fs.statSync(`./MusicCache/${song.id}.mp3`)["size"];
                    if(size == 0){
                        song.startFrom = `0s`;
                        let stream = ytdl(`https://www.youtube.com/watch?v=${song.id}`, {filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1<<25 });
                        let proc = new ffmpeg({source: stream});
                        try{
                            proc.saveToFile(`./MusicCache/${song.id}.mp3`, (stdout, stderr) => {})
                            console.log(`${song.title} → ${song.id} 上次緩存失敗 重新緩存!`);
                        }catch(e){
                            console.log(`${song.title} → ${song.id} 緩存發生問題!`);
                        }
                        dispatcher = serverQueue.connection.play(ytdl(song.url, {filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25}))
                        .on('finish', end => {
                            if(serverQueue.loop == false){serverQueue.songs.shift();}
                            else {
                                if(serverQueue.loop == true){
                                    serverQueue.songs.unshift(serverQueue.songs[0]);
                                    serverQueue.songs.shift();
                                }
                            }
                            this.play(guild, serverQueue.songs[0]);
                            this.main.musictimer.set(guild.id, Date.now());
                        })
                        .on('error', e => console.trace(e));
                    }else{
                        dispatcher = serverQueue.connection.play(`./MusicCache/${song.id}.mp3`, { seek: song.startFrom })
                        .on('finish', end => {
                            if(serverQueue.loop == false){serverQueue.songs.shift();}
                            else {
                                if(serverQueue.loop == true){
                                    serverQueue.songs.unshift(serverQueue.songs[0]);
                                    serverQueue.songs.shift();
                                }
                            }
                            this.play(guild, serverQueue.songs[0]);
                            this.main.musictimer.set(guild.id, Date.now());
                        })
                        .on('error', e => console.trace(e));
                        }
                }
                else{
                    fsPath.writeFileSync(`./MusicCache/${song.id}.mp3`, "");
                    let stream = ytdl(`https://www.youtube.com/watch?v=${song.id}`, {filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1<<25 });
                    let proc = new ffmpeg({source: stream});
                    song.startFrom = `0s`;
                    try{
                    proc.saveToFile(`./MusicCache/${song.id}.mp3`, (stdout, stderr) => {})
                    console.log(`${song.title} → ${song.id} 為首次播放 開始緩存!`);
                    }catch(e){
                        console.log(`${song.title} → ${song.id} 緩存發生問題!`);
                    }
                    dispatcher = serverQueue.connection.play(ytdl(song.url, {filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1<<25}))
                    .on('finish', end => {
                        if(serverQueue.loop == false){serverQueue.songs.shift();}
                        else {
                            if(serverQueue.loop == true){
                                serverQueue.songs.unshift(serverQueue.songs[0]);
                                serverQueue.songs.shift();
                            }
                        }
                        this.play(guild, serverQueue.songs[0]);
                        this.main.musictimer.set(guild.id, Date.now());
                    })
                    .on('error', e => console.trace(e));
                }
                
                dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
                let embed = this.createEmbed(song.author, null, `🎶 開始播放: <@${song.author.id}>添加的**${song.title}**\n\n語音頻道: **${serverQueue.songs[0].guildtag}的${serverQueue.voiceChannel.name}**\n\n\n**此信息將會在5秒後自動刪除**\n`);
                serverQueue.textChannel.send(embed)
                    .then(msg => {
                    msg.delete({timeout: 5000}).catch(console.error);
                    }).catch();
                let looping = '';
                (serverQueue.loop == true) ? looping = "開啟" : looping = "關閉";
                this.main.util.setActivity(this.main, {string: `正在播放: ${song.title} 由 ${song.author.tag} 添加, ||[單曲循環播放: ${looping}]||`, type: 2});
                this.main.musictimer.set(guild.id, Date.now());
            });
        }
    }

    //Get ServerQueue
    getServerQueue(gid){
        return this.main.queue.get(gid);
    }

    //信息發送模塊
    async SDM(channel, message, author, trigger){
        channel.startTyping();
        const sentMsg = await channel.send(message);
        await sentMsg.react('🗑');
        const collector = sentMsg.createReactionCollector((reaction, user) => reaction.emoji.name === '🗑' && !user.bot && user.id === author.id || reaction.message.member.hasPermission('MANAGE_MESSAGES') === true && !user.bot && reaction.emoji.name === '🗑', { time:1000 * 60 * 10, max: 1});
        collector.on('end', async collected => {
            if(collected.size){
                try{
                    await sentMsg.delete().catch((e) => { });
                    if(trigger){
                        await trigger.delete().catch((e) => { });
                    }
                } catch (err) { }
                return;
            }
            if(sentMsg.guild.me.hasPermission('MANAGE_MESSAGES')) { 
                try{
                    await sentMsg.reactions.removeAll() ;
                } catch(e){}
            }
            else{ 
                try{
                    sentMsg.reactions.removeAll() 
                } catch(e){}
            }
        })
        channel.stopTyping();
        return sentMsg;
    }

    progressbar(total, current, size){
        size = size || 35;
        return `[${pb(total, current, size)[0]}]`;
    }

    //function that prevent xss
    htmlEscape(text) {
        return text.replace(/&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/"/g, '&quot;').
        replace(/'/g, '&#027;').
        replace(/>/g, '&gt').
        replace(/\//g, '&#047');
     }

    //Get MusicTimer
    getMusicTimer(gid){
        return this.main.musictimer.get(gid);
    }

    //Check Owner Perm
    checkOwner(user){
        if(user.id != this.main.config.ownerID){
            return false;
        }
        return true;
    }

    //set bot activity (status)
    setActivity(ReiNa, status){
        if(status){
            ReiNa.bot.user.setActivity(status.string, {type: status.type});
        }
        status = status || { string: `${ReiNa.config.prefix}help | ReiNa Is Here! Nya~~~~`, type: 3};
		if(ReiNa.queue.size === 0){
			ReiNa.bot.user.setActivity(status.string, {type: status.type});
		}
	}

    //fetch (return obj)
    fetchJSON(url){
        request.get(url, {}, async (err, req, body) => {
            if(err || req.statusCode != 200){
                return;
            }
            if(!err && req.statusCode === 200){
                let obj = await JSON.parse(body);
                return obj;
            }
        });
    }

    load() {
        let commands = new Map();
        let events = new Map();
        const queue = new Map();
        const musictimer = new Map();
        let time = Date.now();
        let taken = 0;
        const commandDir = `./Commands/`;

        return new Promise((resolve, reject) => {
            fs.readdirSync(commandDir).forEach(folder => {
                let command = false;
                fs.readdirSync(`${commandDir}${folder}/`).forEach(file => {
                    let help = [];
                    if(file.match(/\.js$/) !== null && file !== 'index.js'){
                        command = `.${commandDir}${folder}/${file}`;
                        delete require.cache[require.resolve(command)];
                        command = new (require(command))(this.main);

                        if(commands.has(file.toLowerCase())) console.log(`檔案 ${file} 的指令 ${command.name} 發生衝突! 將不會被載入!`);
                        else commands.set(file.slice(0, -3).toLowerCase(), command);

                        if(command.alias.length) {
                            command.alias.forEach(item => {
                                if(commands.has(item.toLowerCase())) console.log(`指令別稱 ${item} (檔案${file} 的指令 ${command.name}) 發生衝突! 將不會被載入!`);
                                else commands.set(item.toLowerCase(), command);
                            });
                        }

                        taken = Date.now() - time;
                        time = taken + time;
                        console.log(`指令 ${command.name} 成功載入! 載入耗時: ${taken}ms`);
                    }
                });
            });
            resolve({commands, events, queue, musictimer});
        });
    }
}