FROM node:4.3.0

COPY . /opt

WORKDIR /opt

RUN npm install

ENTRYPOINT ["/opt/wr"]

