wrms-cli
========

Limited command-line interactions for Catalyst WRMS.

For now it just dumps the brief+status of a WR and all its descendants.

Unlike the Search page's `childof:` query, this doesn't restrict the results to "direct" descendants - children-of-children are also shown.

## Installing

<pre>
    make
    sudo make install
</pre>

This does depend on a recent version of Node.js, so you may have to add
a slightly nonstandard PPA -

<pre>
    sudo add-apt-repository ppa:chris-lea/node.js
    sudo apt-get update
    sudo apt-get install nodejs
</pre>

## Usage

<pre>
    Usage: wrms-cli [options] <wr...>
        --sort-by [wr|brief|status]
        --host <db-host=db1.db.catalyst.net.nz>
        --port <port=5433>
</pre>

The default sort order is `status`, which is based on the status code's WRMS sequence number rather than alphabetical order; e.g. 'New Request' comes way before 'Need Info'.
