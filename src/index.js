const core = require("@actions/core");
const fetch = require("node-fetch");
const fs = require("fs");
const CHAT_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage";
function generateDeployPayload({ channel, color, text, commitMessage, author, sha, dockerImage }) {
  return {
    text,
    channel,
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: text,
              emoji: true,
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*commit:*\n ${commitMessage} `,
              },
              {
                type: "mrkdwn",
                text: `*요청자:*\n ${author}`,
              },
            ],
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*sha:*\n ${sha}`,
              },
              {
                type: "mrkdwn",
                text: `*Dockerimage:*\n ${dockerImage}`,
              },
            ],
          },
        ],
      },
    ],
  };
}

function generatePRPayload({ text, channel, color, prTitle, author, repo, url }) {
  return {
    text,
    channel,
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: prTitle, emoji: true },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*PR 제목:*\n ${prTitle} `,
              },
              {
                type: "mrkdwn",
                text: `*요청자:*\n ${author}`,
              },
            ],
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*repo:*\n ${repo}`,
              },
            ],
          },
          {
            type: "actions",
            block_id: "submit_button_action_block",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "바로가기",
                },
                url: url,
                action_id: "button-action",
              },
            ],
          },
        ],
      },
    ],
  };
}

function validateToken(token) {
  if (token === undefined || token == null || token.length == 0) {
    throw new Error("invalidate token");
  }
}

async function sendSlackMessage(slackToken, payload) {
  const response = await fetch(CHAT_POST_MESSAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${slackToken}` },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json();
  return responseData;
}

function selectPayload(mode) {
  const { GITHUB_REPOSITORY, GITHUB_EVENT_PATH } = process.env;
  if (!GITHUB_EVENT_PATH) {
    throw new Error("GITHUB_EVENT_PATH is not defined");
  }

  if (mode == "PR") {
    const eventData = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, "utf8"));

    const text = "GITHUB CI 결과";
    const channel = core.getInput("channelId");
    const color = core.getInput("statusColor");

    if (eventData.pull_request == undefined) {
      throw new Error("PR data is undefined");
    }

    const pullRequest = eventData.pull_request;
    const prTitle = pullRequest.title;
    const author = pullRequest.user.login;
    const url = pullRequest.html_url;

    const repo = GITHUB_REPOSITORY;

    const genpayload = generatePRPayload({
      text,
      channel,
      color,
      prTitle,
      author,
      url,
      repo,
    });

    return genpayload;
  } else if (mode == "DEPLOY") {
    const text = "Deploy 결과";
    const channel = core.getInput("channelId");
    const color = core.getInput("statusColor");
    const { SHA, COMMIT_MESSAGE, AUTHOR, DOCKER_IMAGE } = process.env;

    const genpayload = generateDeployPayload({
      text,
      channel,
      color,
      commitMessage: COMMIT_MESSAGE,
      author: AUTHOR,
      sha: SHA,
      dockerImage: DOCKER_IMAGE,
    });
    return genpayload;
  } else {
    throw new Error("[MODE SELECT]not support Mode");
  }
}

async function run() {
  const { SLACK_TOKEN } = process.env;

  try {
    validateToken(SLACK_TOKEN);

    // payload가 있으면 payload를 그대로 리턴한다.
    const payload = core.getMultilineInput("payload");
    if (payload != undefined && payload.length != 0) {
      console.error("[payload send]not support function");
      console.error(payload);
      throw new Error("[payload send]not support function");
    }

    // payload가 없으면 mode 단위로 처리한다.
    const mode = core.getInput("mode");
    const selectedPayload = selectPayload(mode);

    const response = await sendSlackMessage(SLACK_TOKEN, selectedPayload);
    if (response.ok == false) {
      throw new Error("send to message fail..!");
    }

    core.setOutput("ts", response.ts); // ts 셋팅, 나중에 이걸로 인터렉션 가능
  } catch (error) {
    core.setFailed(`Action failed with error ${error}`);
  }
}

run();
