var _ = require('lodash'),
    async = require('async'),
    express = require('express'),
    config = require('./config'),
    xboxapiv2 = require('node-xboxapiv2')(config.xbox.API_KEY);

var fs = require('fs'),
    request = require('request');

var app = express();

var twitterAPI = require('node-twitter-api'),
    twitter = new twitterAPI({
        consumerKey: config.twitter.CONSUMER_KEY,
        consumerSecret: config.twitter.CONSUMER_SECRET
    });


app.get('/', function(req, res){
    res.send('Achievement Tracker is running');
});

app.get('/test', function(req, res) {

    var ago = new Date();
    ago.setMinutes(ago.getMinutes() - 10);

    xboxapiv2.get('RecentActivity', { xuid: config.xbox.PROFILE_ID }, function(err, activites) {

        if (err) {
            return res.send(500, err);
        }

        var recentGames = _.chain(activites)
            .map(function(activity) {
                return (activity.contentType == 'Game' && activity.activityItemType == 'Played')
                    ? { id: activity.titleId, name: activity.contentTitle } : null;
            })
            .reject(function(recentGame) {
                return recentGame == null;
            })
            .uniq('id')
            .value();

        async.concat(recentGames, function(recentGame, cb) {
            xboxapiv2.get('XboxGameAchievements', { xuid: config.xbox.PROFILE_ID, titleId: recentGame.id }, cb);
        }, function(err, achievements) {

            if (err) {
                return res.send(500, err);
            }

            achievements = _.chain(achievements)
                .filter(function(achievement) {
                    return achievement.unlocked;// && achievement.timeUnlocked > ago;
                })
                .each(function(achievement) {
                    achievement.timeUnlocked = new Date(achievement.timeUnlocked);

                    var game = _.find(recentGames, function(recentGame) {
                        return recentGame.id == achievement.titleId;
                    });
                    achievement.title = game ? game.name : null;
                })
                .sortBy('timeUnlocked')
                .value();

            var a = achievements[achievements.length - 1];

            var filename = a.titleId + '_' + a.id;
            request(a.imageUnlocked).pipe(fs.createWriteStream(filename)).on('close', function() {

                twitter.statuses('update_with_media', {
                        status: 'Achievement Unlocked: ' + a.title + ' - ' + a.name + ' - ' + a.gamerscore + 'G',
                        media: [filename]
                    },
                    config.twitter.ACCESS_TOKEN,
                    config.twitter.ACCESS_TOKEN_SECRET,
                    function(err) {
                        fs.unlink(filename);
                        if (err) {
                            return res.send(500, err);
                        } else {
                            return res.send(achievements);
                        }
                    }
                );

            });

        });

    });

});

var server = app.listen(process.env.PORT || 3000, function() {
    console.log('Listening on port %d', server.address().port);
});