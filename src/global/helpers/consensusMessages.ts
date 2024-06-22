import { isAddress as isEthAddress } from 'ethers';
import truncateEthAddress from 'truncate-eth-address';

import type { ChatConsensusMessages, ConsensusResultOption, ConsensusResults } from '../types';

import {
  ACCOUNT_PROMPT_RE, ACCOUNT_PROMPT_REPLACE_RE, ACCOUNT_PROMPT_TEMPLATE, ALLOWED_RANKS,
} from '../../config';
import { buildQueryStringNoUndef } from '../../util/requestQuery';

export function composePrompt(platform: string) {
  return ACCOUNT_PROMPT_TEMPLATE.replace(ACCOUNT_PROMPT_REPLACE_RE, platform);
}

export function promptStrToPlatform(text: string): string | undefined {
  const res = text.match(ACCOUNT_PROMPT_RE);
  return res?.length ? res[1] : undefined;
}

// https://edenfracfront.web.app/?delegate=tadastadas&groupnumber=2&vote1=tadasf&vote2=aaaaa&vote3=bbbb&vote4=cccc&vote5=ddd&vote6=lll
type SubmissionObject = {
  delegate?: string;
  groupnumber?: string;
  vote1?: string;
  vote2?: string;
  vote3?: string;
  vote4?: string;
  vote5?: string;
  vote6?: string;
};

function toSubmissionObject(results: ConsensusResults, platform: string, groupNum?: number): SubmissionObject {
  return {
    delegate: results.delegate?.refUser?.extAccounts[platform],
    groupnumber: groupNum?.toString(),
    vote1: results.rankings[6]?.refUser?.extAccounts[platform],
    vote2: results.rankings[5]?.refUser?.extAccounts[platform],
    vote3: results.rankings[4]?.refUser?.extAccounts[platform],
    vote4: results.rankings[3]?.refUser?.extAccounts[platform],
    vote5: results.rankings[2]?.refUser?.extAccounts[platform],
    vote6: results.rankings[1]?.refUser?.extAccounts[platform],
  };
}

export function prettifyAccountStr(accountStr: string): string {
  if (isEthAddress(accountStr)) {
    return truncateEthAddress(accountStr);
  } else {
    return accountStr;
  }
}

export function createConsensusResultMsg(
  results: ConsensusResults,
  submissionUrl?: string,
  platform?: string,
  accountInfoUrl?: string,
): string {
  function getVotesStr(opt: ConsensusResultOption) {
    return opt.votes && opt.ofTotal ? `${opt.votes}/${opt.ofTotal}` : '';
  }

  let msg = '**Based on the latest polls this seems to be the result:**\n\n';
  for (const rank of ALLOWED_RANKS) {
    const winner = results.rankings[rank];
    const option = winner?.option ?? '';
    const fullAccStr = platform ? winner?.refUser?.extAccounts[platform] : undefined;
    const votes = winner ? getVotesStr(winner) : '';
    if (fullAccStr !== undefined) {
      msg = msg.concat(`Level ${rank}: ${option},acc:${fullAccStr} ${votes}\n`);
    } else {
      msg = msg.concat(`Level ${rank}: ${option} ${votes}\n`);
    }
  }
  msg = msg.concat('\n');

  if (results.delegate) {
    const votes = getVotesStr(results.delegate);
    msg = msg.concat(`Delegate: ${results.delegate.option}    ${votes}\n`);
  }

  if (results.groupNum) {
    msg = msg.concat(`\nGroup number: ${results.groupNum}\n`);
  }

  msg = msg.concat('\n\n👍 if you agree.\n\n');

  if (submissionUrl && platform) {
    const obj = toSubmissionObject(results, platform, results.groupNum);
    const queryStr = buildQueryStringNoUndef(obj);
    msg = msg.concat(`Results can be submitted [here](${submissionUrl}/${queryStr})`);
  }

  if (accountInfoUrl && platform) {
    const fullAccReStr = ',acc:([\\w]+)\\W';
    const accountReStr = `\\W([\\w.…]+)@${platform}\\)${fullAccReStr}`;
    const accountRe = new RegExp(accountReStr, 'g');
    msg = msg.replace(accountRe, `[$&](${accountInfoUrl}/$2) `);
    const fullAccRe = new RegExp(fullAccReStr, 'g');
    msg = msg.replace(fullAccRe, '');
  }

  return msg;
}

export function isConsensusMsg(consensusMessages: ChatConsensusMessages, msgId: number): boolean {
  return isRankingMessage(consensusMessages, msgId)
    || isDelegateMessage(consensusMessages, msgId);
}

export function isRankingMessage(consensusMsgs: ChatConsensusMessages, msgId: number): boolean {
  const val = Object.values(consensusMsgs.rankingPolls).find((msgIds) => {
    return msgIds.has(msgId);
  });

  return val !== undefined;
}

export function isDelegateMessage(consensusMsgs: ChatConsensusMessages, msgId: number): boolean {
  return consensusMsgs.delegatePolls.has(msgId);
}
