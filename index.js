/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 ______    ______    ______   __  __    __    ______
 /\  == \  /\  __ \  /\__  _\ /\ \/ /   /\ \  /\__  _\
 \ \  __<  \ \ \/\ \ \/_/\ \/ \ \  _"-. \ \ \ \/_/\ \/
 \ \_____\ \ \_____\   \ \_\  \ \_\ \_\ \ \_\   \ \_\
 \/_____/  \/_____/    \/_/   \/_/\/_/  \/_/    \/_/


 This is a sample Slack Button application that provides a custom
 Slash command.

 This bot demonstrates many of the core features of Botkit:

 *
 * Authenticate users with Slack using OAuth
 * Receive messages using the slash_command event
 * Reply to Slash command both publicly and privately

 # RUN THE BOT:

 Create a Slack app. Make sure to configure at least one Slash command!

 -> https://api.slack.com/applications/new

 Run your bot from the command line:

 clientId=<my client id> clientSecret=<my client secret> PORT=3000 node bot.js

 Note: you can test your oauth authentication locally, but to use Slash commands
 in Slack, the app must be hosted at a publicly reachable IP or host.


 # EXTEND THE BOT:

 Botkit is has many features for building cool and useful bots!

 Read all about it here:

 -> http://howdy.ai/botkit

 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/

/* Uses the slack button feature to offer a real time bot to multiple teams */
var Botkit = require('botkit');

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.PORT || !process.env.VERIFICATION_TOKEN) {
    console.log('Error: Specify CLIENT_ID, CLIENT_SECRET, VERIFICATION_TOKEN and PORT in environment');
    process.exit(1);
}

var config = {}
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        debug: true,
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: './db_slackbutton_slash_command/',
    };
}

var controller = Botkit.slackbot(config).configureSlackApp(
    {
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        scopes: ['commands'],
    }
);

controller.setupWebserver(process.env.PORT, function (err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);

    controller.createOauthEndpoints(controller.webserver, function (err, req, res) {
        if (err) {
            res.status(500).send('ERROR: ' + err);
        } else {
            res.send('Success!');
        }
    });
});

//
// BEGIN EDITING HERE!
//

const initHandler = (slashCommand, message, rest) => {
    if (message.user_id !== process.env.ADMIN_ID) {
        slashCommand.replyPrivate(message, 'You have to be an admin to initialize users!');
        return;
    }
    const [points, ...userList] = rest;
    const pointsInt = parseInt(points, 10);
    if (isNaN(pointsInt)) {
        slashCommand.replyPrivate(message, `Pass an integer as value for points!`);
        return;
    }
    if (!userList) {
        slashCommand.replyPrivate(message, `Pass username(s) to initialize!`);
        return;
    }
    const userIdList = userList.map((user) => user.split('|')[0].substr(2));
    slashCommand.replyPrivate(message, `Initializing ${userList} with ${pointsInt}!`, function () {
        userIdList.forEach((user_id) => {
            controller.storage.users.get(user_id, function (err, user_data) {
                if (user_data) {
                    controller.storage.users.save({
                        ...user_data,
                        points: pointsInt,
                        id: user_id,
                    }, (err) => {
                        if (err) console.log(`Error: ${err}`);
                    });
                } else {
                    controller.storage.users.save({
                        id: user_id,
                        points: pointsInt
                    }, (err) => {
                        if (err) console.log(`Error: ${err}`);
                    });
                }
            });
        });
        console.log('done initializing');
    });
};

const takeHandler = (slashCommand, message, rest) => {
    const [points, from, user, _for, pr_link] = rest;
    const pointsInt = parseInt(points, 10);
    if (isNaN(pointsInt)) {
        slashCommand.replyPrivate(message, 'Pass an integer as value for points!');
        return;
    }
    if (from !== 'from' && from !== 'From' && from !== 'FROM') {
        slashCommand.replyPrivate(message, 'Incorrect command! Please refer to /board help');
        return;
    }
    if (!user) {
        slashCommand.replyPrivate(message, 'Specify someone!');
        return;
    }
    if (_for !== 'for' && _for !== 'For' && _for !== 'FOR') {
        slashCommand.replyPrivate(message, 'Incorrect command! Please refer to /board help');
        return;
    }
    if (!pr_link) {
        slashCommand.replyPrivate(message, 'Specify the link of the PR that you reviewed!');
        return;
    }
    const user_id = user.split('|')[0].substr(2);
    if (message.user === user_id) {
        slashCommand.replyPrivate(message, "Can't take points from yourself!");
        return;
    }
    slashCommand.replyPublic(message, `<@${message.user}> took ${pointsInt} from ${user} for review of ${pr_link}!`, () => {
        controller.storage.users.get(user_id, (err, user_data) => {
            if (user_data && typeof user_data.points !== 'undefined') {
                controller.storage.users.get(message.user, function (err, caller_data) {
                    if (caller_data && typeof caller_data.points !== 'undefined') {
                        caller_data.points += pointsInt;
                        controller.storage.users.save({
                            ...caller_data,
                            id: message.user,
                        }, (err) => {
                            if (err) {
                                slashCommand.replyPublicDelayed(message, 'The transfer failed to record in the database. Contact admin');
                                console.log(`Error: ${err}`);
                                return;
                            }
                            user_data.points -= pointsInt;
                            controller.storage.users.save({
                                ...user_data,
                                id: user_id,
                            }, (err) => {
                                if (err) {
                                    slashCommand.replyPublicDelayed(message, 'The transfer failed to record in the database. Contact admin');
                                    console.log(`Error: ${err}`);
                                }
                            });
                        });
                    } else {
                        slashCommand.replyPublicDelayed(message, `<@${message.user}>, the command caller, does not have any points. Contact admin`);
                    }
                });
            } else {
                slashCommand.replyPublicDelayed(message, `${user} does not have any points to be taken. Contact admin`);
            }
        });
    });
};

const leaderBoardHandler = (slashCommand, message) => {
    slashCommand.replyPrivate(message, "Fetching leaderboard...", () => {
        controller.storage.users.all((err, all_user_data) => {
            if (err) {
                console.log(`Error: ${err}`);
                return;
            }
            if (all_user_data) {
                const user_with_points = all_user_data.filter((user) => user.points);
                if (!user_with_points.length) {
                    slashCommand.replyPrivateDelayed(message, "No leaderboard exists. Contact admin");
                    return;
                }
                const user_points = user_with_points.map((user) => ({
                    'name': `<@${user.id}>`,
                    'points': user.points
                })
                );
                let leaderboard = "Username --> Points";
                user_points.forEach((user) => {
                    leaderboard = `${leaderboard}\n${user.name} --> ${user.points}`;
                });
                slashCommand.replyPrivateDelayed(message, leaderboard);
            }
        });
    });
}

const commandHandler = (slashCommand, message) => {
    const [command, ...rest] = message.text.split(" ");
    if (command === 'init') initHandler(slashCommand, message, rest);
    else if (command === 'take') takeHandler(slashCommand, message, rest);
    else if (command === 'show') leaderBoardHandler(slashCommand, message);
    else slashCommand.replyPrivate(message, "I'm afraid I don't know how to " + command + " yet.");
};

controller.on('slash_command', function (slashCommand, message) {

    console.log(`slash command ${message.command} received`);
    if (message.token !== process.env.VERIFICATION_TOKEN) return; //just ignore it.
    if (message.channel_id !== process.env.CHANNEL_ID) {
        slashCommand.replyPrivate(message, 'Can only use this command inside code_reviews private channel!');
        return;
    }

    switch (message.command) {
        case '/board':
            console.time('slash command');
            if (message.text === "" || message.text === "help") {
                slashCommand.replyPrivate(message,
                    "Leaderboard at your service! " +
                    "Try typing `/board take [integer points] from @user for [PR link]` to put me to work. " +
                    "Or type `/board show` to view the leaderboard");
                console.timeEnd('slash command');
            } else {
                commandHandler(slashCommand, message);
                console.timeEnd('slash command');
            }

            break;

        default:
            slashCommand.replyPublic(message, "I'm afraid I don't know how to " + message.command + " yet.");

    }

});
