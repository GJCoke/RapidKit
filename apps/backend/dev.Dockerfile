# python 3.14
FROM python:3.14-slim

RUN apt-get update && \
    apt-get install -y gcc libpq-dev && \
    apt clean && \
    rm -rf /var/cache/apt/*

# set python env
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8

# copy pyproject.toml
COPY pyproject.toml ./

# pip install
RUN pip install -U pip \
    && pip install -e .[dev]

# copy current dir to image src
COPY . /app
ENV PATH "$PATH:/src/scripts"

# run as root
USER root
WORKDIR /app

# start server
CMD ["./scripts/run-dev.sh"]
