# https://www.openproject.org/docs/installation-and-operations/installation/docker/#using-this-container-in-production
FROM openproject/openproject:14

RUN apt update && apt install -y jq

COPY ./run.sh /
RUN chmod +x /run.sh

ENTRYPOINT [ "/bin/bash" ]

CMD [ "/run.sh" ]