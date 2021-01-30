import chalk from "chalk";
import CID from "cids";

import * as Preserve from "@truffle/preserve";
import { IpfsClient, FileObject } from "./adapter";

export interface UploadOptions {
  controls: Preserve.Controls;
  source: Preserve.Targets.Source;
  data: Iterable<FileObject>;
  ipfs: IpfsClient;
}

export interface UploadResult {
  cid: CID;
}

export async function* upload(
  options: UploadOptions
): Preserve.Process<UploadResult> {
  const {
    source,
    ipfs,
    data,
    controls: { step }
  } = options;

  const task = yield* step({
    message: "Uploading..."
  });

  const unknowns: {
    [unknown: string]: Preserve.Control.ValueResolutionController;
  } = {
    root: yield* task.declare({ identifier: "Root CID" })
  };

  for await (const { path } of data) {
    if (path !== ".") {
      unknowns[path] = yield* unknowns.root.extend({ identifier: path });
    }
  }

  // add to IPFS
  const results = ipfs.addAll(data, {
    wrapWithDirectory: Preserve.Targets.Sources.isContainer(source)
  });

  let result;
  try {
    for await (result of results) {
      const { path, cid } = result;

      const unknown = unknowns[`./${path}`];
      if (unknown) {
        yield* unknown.resolve({
          resolution: { cid },
          payload: cid.toString()
        });
      }
    }
  } catch (error) {
    yield* task.fail({ error });
  }

  yield* unknowns.root.resolve({
    resolution: result,
    payload: chalk.bold(result.cid.toString())
  });

  yield* task.succeed();

  return result;
}