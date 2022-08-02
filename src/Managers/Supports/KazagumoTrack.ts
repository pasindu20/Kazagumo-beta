import { Kazagumo } from '../../Kazagumo';
import {
  RawTrack,
  SupportedSources,
  SourceIDs,
  KazagumoError,
  escapeRegExp,
  ResolveOptions,
  Events,
} from '../../Modules/Interfaces';
import { Track } from 'shoukaku';

export default class KazagumoTrack {
  /**
   * Kazagumo Instance
   */
  public kazagumo: Kazagumo | undefined;
  /**
   * Track Requester
   */
  public requester: unknown | undefined;

  /** Track's Base64 */
  public track: string;
  /** Track's source */
  public sourceName: string;
  /** Track's title */
  public title: string;
  /** Track's URI */
  public uri: string;
  /** Track's identifier */
  public identifier: string;
  /** Whether the track is seekable */
  public isSeekable: boolean;
  /** Whether the track is a stream */
  public isStream: boolean;
  /** Track's author */
  public author: string | undefined;
  /** Track's length */
  public length: number | undefined;
  /** Track's position (idk this) */
  public position: number | undefined;
  /** Track's thumbnail, if available */
  public thumbnail: string | undefined;
  /** The youtube/soundcloud URI for spotify and other unsupported source */
  public realUri: string | null;

  public resolvedBySource: boolean = false;

  constructor(raw: RawTrack, requester: unknown) {
    this.kazagumo = undefined;

    this.track = raw.track;
    this.sourceName = raw.info.sourceName;
    this.title = raw.info.title;
    this.uri = raw.info.uri;
    this.identifier = raw.info.identifier;
    this.isSeekable = raw.info.isSeekable;
    this.isStream = raw.info.isStream;
    this.author = raw.info.author;
    this.length = raw.info.length;
    this.position = raw.info.position;
    this.thumbnail = raw.info.thumbnail;
    this.realUri = SupportedSources.includes(this.sourceName) ? this.uri : null;

    this.requester = requester;

    if (this.sourceName === 'youtube' && this.identifier)
      this.thumbnail = `https://img.youtube.com/vi/${this.identifier}/hqdefault.jpg`;
  }

  /**
   * Get json of this track
   * @returns {RawTrack}
   */
  public getRaw(): RawTrack {
    return {
      track: this.track,
      info: {
        title: this.title,
        uri: this.uri,
        identifier: this.identifier,
        author: this.author,
        sourceName: this.sourceName,
        isSeekable: this.isSeekable,
        isStream: this.isStream,
        length: this.length,
        position: this.position,
        thumbnail: this.thumbnail,
      },
    };
  }

  /**
   * Set kazagumo instance
   * @param kazagumo Kazagumo instance
   * @returns KazagumoTrack
   */
  setKazagumo(kazagumo: Kazagumo): KazagumoTrack {
    this.kazagumo = kazagumo;
    if (this.sourceName === 'youtube' && this.identifier)
      this.thumbnail = `https://img.youtube.com/vi/${this.identifier}/${
        kazagumo.KazagumoOptions.defaultYoutubeThumbnail ?? 'hqdefault'
      }.jpg`;

    return this;
  }

  /**
   * Whether the track is ready to play or need to be solved
   */
  get readyToPlay(): boolean {
    return (
      this.kazagumo !== undefined &&
      !!this.track &&
      !!this.sourceName &&
      !!this.identifier &&
      !!this.author &&
      !!this.length &&
      !!this.title &&
      !!this.uri &&
      !!this.realUri
    );
  }

  /**
   * Resolve the track
   * @param options Resolve options
   * @returns Promise<KazagumoTrack>
   */
  public async resolve(options?: ResolveOptions): Promise<KazagumoTrack> {
    if (!this.kazagumo) throw new KazagumoError(1, 'Kazagumo is not set');
    if (
      this.kazagumo.KazagumoOptions.trackResolver &&
      typeof this.kazagumo.KazagumoOptions.trackResolver === 'function' &&
      (await this.kazagumo.KazagumoOptions.trackResolver.bind(this)(options))
    )
      return this;
    const resolveSource = this.kazagumo.KazagumoOptions?.sourceForceResolve?.includes(this.sourceName);
    const { forceResolve, overwrite } = options ? options : { forceResolve: false, overwrite: false };

    if (!forceResolve && this.readyToPlay) return this;
    if (resolveSource && this.resolvedBySource) return this;
    if (resolveSource) this.resolvedBySource = true;

    this.kazagumo.emit(Events.Debug, `Resolving ${this.sourceName} track ${this.title}; Source: ${this.sourceName}`);

    const result = await this.getTrack();
    if (!result) throw new KazagumoError(2, 'No results found');

    this.track = result.track;
    this.realUri = result.info.uri;
    this.length = result.info.length;

    if (overwrite || resolveSource) {
      this.title = result.info.title;
      this.identifier = result.info.identifier;
      this.isSeekable = result.info.isSeekable;
      this.author = result.info.author;
      this.length = result.info.length;
      this.isStream = result.info.isStream;
      this.uri = result.info.uri;
    }
    return this;
  }

  private async getTrack(): Promise<Track> {
    if (!this.kazagumo) throw new Error('Kazagumo is not set');

    const defaultSearchEngine = this.kazagumo.KazagumoOptions.defaultSearchEngine;
    const source = (SourceIDs as any)[defaultSearchEngine || 'youtube'] || 'yt';
    const query = [this.author, this.title].filter((x) => !!x).join(' - ');
    const node = this.kazagumo.getLeastUsedNode();

    if (!node) throw new KazagumoError(1, 'No nodes available');

    const result = await node.rest.resolve(`${source}search:${query}`);
    if (!result || !result.tracks.length) throw new KazagumoError(2, 'No results found');

    if (this.author) {
      const author = [this.author, `${this.author} - Topic`];
      const officialTrack = result.tracks.find(
        (track) =>
          author.some((name) => new RegExp(`^${escapeRegExp(name)}$`, 'i').test(track.info.author)) ||
          new RegExp(`^${escapeRegExp(this.title)}$`, 'i').test(track.info.title),
      );
      if (officialTrack) return officialTrack;
    }
    if (this.length) {
      const sameDuration = result.tracks.find(
        (track) =>
          track.info.length >= (this.length ? this.length : 0) - 2000 &&
          track.info.length <= (this.length ? this.length : 0) + 2000,
      );
      if (sameDuration) return sameDuration;
    }

    return result.tracks[0];
  }
}
