import {
  ACCOUNT_PROMPT_RE, ACCOUNT_PROMPT_REPLACE_RE, ACCOUNT_PROMPT_TEMPLATE, ALLOWED_RANKS,
} from '../../config';
import { buildQueryStringNoUndef } from '../../util/requestQuery';
import type { ConsensusResultOption, ConsensusResults } from '../types';

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

export function createConsensusResultMsg(
  results: ConsensusResults,
  submissionUrl?: string,
  platform?: string,
  groupNum?: number,
): string {
  function getVotesStr(opt: ConsensusResultOption) {
    return opt.votes && opt.ofTotal ? `${opt.votes} / ${opt.ofTotal}` : '';
  }

  let msg = '**Based on the latest polls this seems to be the result:**\n\n';
  for (const rank of ALLOWED_RANKS) {
    const winner = results.rankings[rank];
    const option = winner?.option ?? '';
    const votes = winner ? getVotesStr(winner) : '';
    msg = msg.concat(`Level ${rank}: ${option}     ${votes}\n`);
  }
  msg = msg.concat('\n');

  if (results.delegate) {
    const votes = getVotesStr(results.delegate);
    msg = msg.concat(`Delegate: ${results.delegate.option}    ${votes}\n`);
  }

  msg = msg.concat('\n\nPlease check if correct. 👍 if so.\n\n');

  if (submissionUrl && platform) {
    const obj = toSubmissionObject(results, platform, groupNum);
    const queryStr = buildQueryStringNoUndef(obj);
    msg = msg.concat(`Submit here if this is correct: ${submissionUrl}/${queryStr}`);
  }

  return msg;
}
