.PHONY: all clean install uninstall

all: package.json
	rm -fr node_modules
	npm install -d

clean:
	rm -fr node_modules

install: wrms-cli
	mkdir -p /usr/local/lib/wrms-cli
	rsync -a --exclude .git . /usr/local/lib/wrms-cli/
	ln -s /usr/local/lib/wrms-cli/wrms-cli /usr/local/bin/wr

uninstall:
	rm -f /usr/local/bin/wr
	rm -fr /usr/local/lib/wrms-cli

