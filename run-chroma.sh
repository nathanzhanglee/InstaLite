#!/bin/bash
export CHROMA_PATH=`pwd`
chroma run --host 0.0.0.0 --path ${CHROMA_PATH}/chroma
