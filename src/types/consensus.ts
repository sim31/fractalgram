import { ApiUser } from "../api/types";
import { Rank } from "../config";

export type ChatConsensusMessages = {
  // id of prompt message -> platform
  extAccountPrompts: Record<number, string>;
  // platform -> ids of replies to prompt messages for a platform
  extAccountReplies: Record<string, Set<number>>;
  // rank -> poll message ids
  rankingPolls: Record<number, Set<number>>;
  // delegate poll ids
  delegatePolls: Set<number>;
};

export interface ExtUser extends ApiUser {
  // platform -> account name
  extAccounts: Record<string, string>;
}

export interface ConsensusResultOption {
  option: string;
  votes?: number;
  ofTotal?: number;
  refUser?: ExtUser;
}

export interface ConsensusResults {
  groupNum?: number;
  delegate?: ConsensusResultOption;
  rankings: Partial<Record<Rank, ConsensusResultOption>>;
}

export type ExtPlatformInfo = {
  displayTitle: string;
  fractalName: string;
  platform: string;
  submitUrl: string;
  accountInfoUrl?: string;
};

export type AccountMap = Map<string, ExtUser>;

export type PollModalDefaults = {
  question: string;
  options: string[];
  isAnonymous: boolean;
  pinned: boolean;
  includeRanked: boolean;
};

export interface AccountPromptDefaults {
  platform: string;
}

export interface AccountPromptInfo extends AccountPromptDefaults {
  promptMessage: string;
}
