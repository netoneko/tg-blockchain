const _ = require('lodash'),
    Promise = require('bluebird'),
    git = require('nodegit'),
    fs = require('fs'),
    TelegramBot = require('node-telegram-bot-api'),
    TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN,
    REPO_PATH = process.env.REPO_PATH || './tmp/',
    DEFAULT_AUTHOR = process.env.REPO_PATH || 'noreply',
    DEFAULT_EMAIL = process.env.DEFAULT_EMAIL || 'noreply@example.com';

const updateMessage = (message) => {
    const tokens = message.split('\n'),
        seed = _.parseInt(tokens[0]) || 0;

    tokens[0] = seed + 1;
    return tokens.join('\n');
};

const proofOfWork = (repo, oid, update_ref) => {
    if (_.startsWith(oid.tostrS(), '00')) {
        return oid;
    }

    return git.Commit.lookup(repo, oid).then(commit => {
        const author = commit.author(),
            committer = commit.committer(),
            message = commit.message(),
            enconding = 'utf8',
            treeId = commit.treeId();

        return commit.amend(update_ref, author, committer, enconding, updateMessage(message), treeId);
    }).then(oid => {
        return proofOfWork(repo, oid, update_ref);
    });
};

const commit = (repo, message, parent) => {
    const append = (index) => {
        return index.addByPath('blank').then(() => {
            return index.writeTree();
        });
    };

    return repo.refreshIndex().then(append).then(oid => {
            const author = git.Signature.now(DEFAULT_AUTHOR, DEFAULT_EMAIL),
                committer = author,
                parents = _.isEmpty(parent) ? [] : [parent];

            return repo.createCommit('HEAD', author, committer, message, oid, parents);
    }).then(oid => {
        return proofOfWork(repo, oid, 'HEAD');
    });
};

const getRepo = (path) => {
    const open = () => git.Repository.open(path);

    if (!fs.existsSync(path)) {
        console.log('Initializing new git repo');

        return git.Repository.init(path, 0).then(open).then(repo => {
            fs.writeFileSync(`${path}/blank`, '');
            return commit(repo, '0\n\nInitial commit');
        }).then(open);
    }

    return open();
};

const getHEAD = (repo) => {
    return git.Reference.nameToId(repo, 'HEAD').then(head => {
        return repo.getCommit(head);
    });
};

const formatMessage = (msg) => {
    const name = _.trim(`${msg.from.first_name || ''} ${msg.from.last_name || ''}`),
        date = new Date(msg.date * 1000).toISOString();
    return `${name} <@${msg.from.username}> ${date}: ${msg.text}`;
};

const copyArray = (source, destination) => {
    while (source.length > 0) {
        destination.push(source.pop());
    }
};

const createBlock = (repo, queue, lock) => {
    if (_.isEmpty(queue) || lock) return;

    console.log(`Creating new block, size: ${queue.length}`);

    const values = [];
    copyArray(queue, values);

    const formatted = _(values).sortBy('date').map(formatMessage).value();

    lock = true;

    getHEAD(repo).then(head => {
        formatted.unshift(`${head.sha()}\n`);
        formatted.unshift('0\n');

        return commit(repo, formatted.join('\n'), head);
    }).catch(err => {
        console.log(err);
        copyArray(values, queue);
    }).then(() => lock = false);
};

const createBot = (token, repo) => {
    const bot = new TelegramBot(token, {polling: true}),
        queue = [],
        lock = false;

    setInterval(_.partial(createBlock, repo, queue, lock), 10000);

    bot.on('message', (msg) => {
      console.log(msg);
      queue.push(msg);
    });
};

getRepo(REPO_PATH).then(repo => createBot(TELEGRAM_TOKEN, repo)).catch(console.log);
