const _ = require('lodash'),
    Promise = require('bluebird'),
    git = require('nodegit'),
    fs = require('fs'),
    REPO_PATH = process.env.REPO_PATH || './tmp/',
    DEFAULT_AUTHOR = process.env.REPO_PATH || 'noreply',
    DEFAULT_EMAIL = process.env.DEFAULT_EMAIL || 'noreply@example.com';

const updateMessage = (message) => {
    const tokens = message.split(' '),
        seed = _.parseInt(tokens[0]) || 0;

    tokens[0] = seed + 1;
    return tokens.join(' ');
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
    console.log(repo, message)
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

    if (!fs.exists(path)) {
        return git.Repository.init(path, 0).then(open).then(repo => {
            fs.writeFileSync(`${path}/blank`, '');
            return commit(repo, '0 Initial commit');
        }).then(oid => {
            console.log('$$$', oid)
            return open();
        });
    }

    return open();
};

const getHEAD = (repo) => {
    return git.Reference.nameToId(repo, 'HEAD').then(head => {
        return repo.getCommit(head);
    });
};

getRepo(REPO_PATH).then(repo => {
    return getHEAD(repo).then(head => {
        return commit(repo, 'Other stuff', head);
    }).then(() => getHEAD(repo)).then(head => {
        return commit(repo, 'Some stuff', head);
    });
}).catch(console.log);
