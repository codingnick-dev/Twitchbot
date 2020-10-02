const { ChatClient } = require('twitch-chat-client');
const { ApiClient, TwitchApiCallType } = require('twitch');
const { StaticAuthProvider, RefreshableAuthProvider } = require('twitch-auth');
const axios = require('axios');

const fs = require('fs');

const activeModes = {
  Vote: 'Vote',
  Choose: 'Choose',
  EmoteRain: 'EmoteRain',
  Paused: 'Paused',
  Disabled: 'Disabled',
};

let activeMode = activeModes.Disabled;

const loadLocal = true;

const express = require('express');
const ejs = require('ejs');
const app = express();

app.use('/imgs', express.static('customImgs'));

var http = require('http').createServer(app);
var io = require('socket.io')(http);
const port = 3000;

// {
//     "access_token": "",
//     "expires_in": ,
//     "refresh_token": "",
//     "scope": ["chat:edit", ""],
//     "token_type": "",
//     "clientID": ""
//   }

let rawdata = fs.readFileSync('login-credencials.json');
let rawdata2 = fs.readFileSync('tokens.json');
let logindata = JSON.parse(rawdata);
const tokenData = JSON.parse(rawdata2);

async function readUserMessage() {
  const clientId = logindata.clientID;
  const clientSecret = logindata.clientSecret;

  const authProvider = new RefreshableAuthProvider(
    new StaticAuthProvider(clientId, tokenData.accessToken),
    {
      clientSecret,
      refreshToken: tokenData.refreshToken,
      expiry:
        tokenData.expiryTimestamp === null
          ? null
          : new Date(tokenData.expiryTimestamp),
      onRefresh: async ({ accessToken, refreshToken, expiryDate }) => {
        const newTokenData = {
          accessToken,
          refreshToken,
          expiryTimestamp: expiryDate === null ? null : expiryDate.getTime(),
        };
        fs.writeFileSync('./tokens.json', JSON.stringify(newTokenData));
      },
    }
  );
  const apiClient = new ApiClient({ authProvider });

  const chatClient = new ChatClient(authProvider, { channels: ['codingnick'] });
  try {
    await chatClient.connect();
  } catch (err) {
    console.log(err);
  }

  //#region Load Emoticons
  let loadedIcons = {};
  if (loadLocal) {
    let rawdata = fs.readFileSync('./allEmoticons.json');
    loadedIcons = JSON.parse(rawdata);
  } else {
    //#region Load Emoticons from twitch
    loadedIcons = (
      await axios({
        url: 'https://api.twitch.tv/kraken/chat/emoticons',
        method: 'get',
        headers: {
          Accept: 'application/vnd.twitchtv.v5+json',
          'Client-ID': clientId,
        },
      })
    ).data.emoticons;
    fs.writeFileSync('./allEmoticons.json', '{');
    loadedIcons = loadedIcons.forEach((icon) => {
      if (icon.images) {
        fs.appendFileSync(
          './allEmoticons.json',
          `"${icon.regex}": "${icon.images.url}",\n`
        );
      }
    });
    fs.appendFileSync('./allEmoticons.json', '}');
    //#endregion
  }
  //#endregion

  //#region React to Chat
  const followAgeListener = chatClient.onMessage(
    async (channel, user, message, msg) => {
      console.log(`${user}: ${message}`);
      let getAllEmotes = '';
      let emotes = msg.parseEmotes();

      //#region Emotes
      for (let i = 0; i < emotes.length; i++) {
        let emote = emotes[i];
        if (activeMode == activeModes.Vote) {
          if (emote.name) {
            console.log(loadedIcons[emote.name]);
            if (emote.name == 'VoteNay') {
              io.sockets.emit('simpleVote', { user: user, message: 'VoteNay' });
              break;
            }
            if (emote.name == 'VoteYea') {
              io.sockets.emit('simpleVote', { user: user, message: 'VoteYea' });
              break;
            }
          }
        }
        if (activeMode == activeModes.EmoteRain) {
          if (loadedIcons[emote.name]) {
            io.sockets.emit('emoteRain', loadedIcons[emote.name]);
          }
        }
      }
      //#endregion
    }
  );
  //#endregion
}

readUserMessage();

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  res.render('stream-overlay');
});

app.get('/admin', (req, res) => {
  res.render('stream-manager');
});

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('setMode', (data) => {
    activeMode = data;
    io.sockets.emit('changedMode', data);
  });
});

http.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
