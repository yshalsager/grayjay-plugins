(function() {

	function thumbnails(url) {
		return new Thumbnails([new Thumbnail(url, 0)]);
	}
	function audio_source_descriptor({ name, url, language = "Unknown", duration = 0, container = "audio/mpeg", codec = "mp3", bitrate = 0 }) {
		return audio_sources_descriptor([{
			name,
			url,
			language,
			duration,
			container,
			codec,
			bitrate
		}]);
	}
	function audio_sources_descriptor(sources) {
		return new UnMuxVideoSourceDescriptor([], sources.map(({ name, url, language = "Unknown", duration = 0, container = "audio/mpeg", codec = "mp3", bitrate = 0 }) => new AudioUrlSource({
			name,
			bitrate,
			container,
			codec,
			duration,
			url,
			language
		})));
	}

	function plugin_asset(config, path) {
		const url = String(path ?? "");
		if (/^https?:\/\//.test(url)) return url;
		const base = String(config?.sourceUrl ?? "").replace(/\/[^/]*$/, "/");
		return base ? `${base}${url.replace(/^\.\//, "")}` : url;
	}
	function plugin_icon_url(config, default_icon) {
		return config?.absoluteIconUrl ?? plugin_asset(config, config?.iconUrl ?? default_icon);
	}
	function content_thumbnails(config, default_icon, url) {
		return thumbnails(url || plugin_icon_url(config, default_icon));
	}

	function grayjay_platform(platform, get_config_id) {
		const platform_id = (id) => new PlatformID(platform, String(id), get_config_id());
		return {
			id: platform_id,
			author(id, name, url, thumbnail) {
				return new PlatformAuthorLink(platform_id(id), name, url, thumbnail);
			},
			feed_video(id, value) {
				return new PlatformVideo({
					id: platform_id(id),
					...value
				});
			},
			video(id, value) {
				return new PlatformVideoDetails({
					id: platform_id(id),
					...value
				});
			},
			nested(id, value) {
				return new PlatformNestedMediaContent({
					id: platform_id(id),
					...value
				});
			},
			channel(id, value) {
				return new PlatformChannel({
					id: platform_id(id),
					subscribers: 0,
					...value
				});
			},
			playlist(id, value) {
				return new PlatformPlaylist({
					id: platform_id(id),
					...value
				});
			},
			playlist_details(id, value) {
				return new PlatformPlaylistDetails({
					id: platform_id(id),
					...value
				});
			}
		};
	}

	function get_response(url, headers = {}, useAuth = false) {
		const response = http.GET(url, headers, useAuth);
		if (!response.isOk) throw new ScriptException(`Request failed with code ${response.code}: ${url}`);
		return response;
	}
	function get_text(url, headers = {}, useAuth = false) {
		return get_response(url, headers, useAuth).body;
	}
	function get_json(url, headers = {}, useAuth = false) {
		return JSON.parse(get_text(url, headers, useAuth));
	}
	function query_string(params) {
		return params.filter((item) => item[1] !== null && item[1] !== void 0).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
	}
	function init_lru_caches(state, limits) {
		state.cacheOrder = state.cacheOrder ?? {};
		for (const cacheName of Object.keys(limits)) {
			state[cacheName] = state[cacheName] ?? {};
			if (!Array.isArray(state.cacheOrder[cacheName])) state.cacheOrder[cacheName] = Object.keys(state[cacheName]);
			prune_lru_cache(state, limits, cacheName);
		}
	}
	function cache_set(state, limits, cacheName, key, value) {
		if (!key) return value;
		state[cacheName] = state[cacheName] ?? {};
		state.cacheOrder = state.cacheOrder ?? {};
		state.cacheOrder[cacheName] = Array.isArray(state.cacheOrder[cacheName]) ? state.cacheOrder[cacheName] : Object.keys(state[cacheName]);
		const cacheKey = String(key);
		const order = state.cacheOrder[cacheName];
		const previousIndex = order.indexOf(cacheKey);
		if (previousIndex >= 0) order.splice(previousIndex, 1);
		state[cacheName][cacheKey] = value;
		order.push(cacheKey);
		prune_lru_cache(state, limits, cacheName);
		return value;
	}
	function prune_lru_cache(state, limits, cacheName) {
		const limit = limits[cacheName];
		const order = state.cacheOrder?.[cacheName];
		if (!limit || !Array.isArray(order)) return;
		while (order.length > limit) {
			const key = order.shift();
			if (key) delete state[cacheName][key];
		}
	}

	function apply_pager_state(target, next) {
		target.results = next.results;
		target.hasMore = next.hasMore;
		target.context = next.context;
		return target;
	}
	function array_pager_class(BasePager) {
		return class ArrayPager extends BasePager {
			constructor(items, limit, offset = 0) {
				const results = items.slice(offset, offset + limit);
				super(results, offset + limit < items.length, {
					items,
					limit,
					offset: offset + limit
				});
			}
			nextPage() {
				return apply_pager_state(this, new this.constructor(this.context.items, this.context.limit, this.context.offset));
			}
		};
	}
	function empty_pager_class(BasePager) {
		return class EmptyPager extends BasePager {
			constructor() {
				super([], false, {});
			}
			nextPage() {
				return this;
			}
		};
	}

	function decode_html(value) {
		return String(value ?? "").replace(/&#0*39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
	}
	function clean_text(value) {
		return decode_html(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
	}
	function normalize_text(value) {
		return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
	}
	function normalize_search_text(value) {
		return normalize_text(value).replace(/[\u064b-\u065f\u0670]/g, "").replace(/[إأآٱا]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ـ/g, "").replace(/[^\w\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
	}

	var PLATFORM = "Mixlr";
	var BASE_URL = "https://mixlr.com";
	var API_BASE = "https://api.mixlr.com/v3";
	var API_CDN_BASE = "https://apicdn.mixlr.com/v3";
	var DEFAULT_ICON = "https://mixlr.com/favicon.ico";
	var DEFAULT_LIMIT = 24;
	var CHANNEL_LIMIT = 24;
	var CACHE_MAX_AGE_MS = 60 * 1e3;
	var CACHE_LIMITS = {
		pageCache: 40,
		channelCache: 120,
		eventCache: 180
	};
	var HOME_MODES = {
		POPULAR: 0,
		CATEGORY: 1,
		SEARCH: 2
	};
	var CATEGORIES = [
		{
			id: "",
			name: "Popular"
		},
		{
			id: "2",
			name: "Religion"
		},
		{
			id: "28",
			name: "Talk"
		},
		{
			id: "24",
			name: "Culture"
		},
		{
			id: "36",
			name: "Eclectic"
		},
		{
			id: "3",
			name: "Sports"
		},
		{
			id: "38",
			name: "Uncategorized"
		}
	];
	var DEFAULT_HEADERS = {
		"User-Agent": `grayjay.app/${bridge.buildVersion}`,
		Accept: "text/html,application/xhtml+xml,application/json"
	};
	var REGEX = {
		ROOT: /^https?:\/\/(?:www\.)?mixlr\.com\/?$/,
		CHANNEL: /^mixlr:\/\/channel\/([a-z0-9-]+)$/,
		EVENT: /^mixlr:\/\/event\/([a-z0-9-]+)\/(\d+)$/,
		WEB_SUBDOMAIN_CHANNEL: /^https?:\/\/([a-z0-9-]+)\.mixlr\.com\/?(?:[?#].*)?$/,
		WEB_SUBDOMAIN_EVENT: /^https?:\/\/([a-z0-9-]+)\.mixlr\.com\/events\/(\d+)(?:[/?#].*)?$/,
		WEB_LEGACY_CHANNEL: /^https?:\/\/(?:www\.)?mixlr\.com\/([a-z0-9-]+)\/?(?:[?#].*)?$/,
		WEB_LEGACY_EVENT: /^https?:\/\/(?:www\.)?mixlr\.com\/([a-z0-9-]+)\/events\/(\d+)(?:[/?#].*)?$/
	};
	var RESERVED_SLUGS = [
		"about",
		"customers",
		"events",
		"explore",
		"help",
		"join",
		"live",
		"priceplans",
		"privacy",
		"search",
		"settings",
		"signin",
		"signout",
		"solutions",
		"terms-of-use",
		"use-cases"
	];
	var _config = {};
	var _settings = {};
	var grayjay = grayjay_platform(PLATFORM, () => _config.id);
	var state = {
		pageCache: {},
		channelCache: {},
		eventCache: {},
		cacheOrder: {}
	};
	source.enable = function(conf, settings, savedState) {
		_config = conf ?? {};
		_settings = settings ?? {};
		if (savedState) try {
			state = JSON.parse(savedState);
		} catch (e) {
			logIfTesting("Failed to parse Mixlr state: " + e);
		}
		state.pageCache ??= {};
		state.channelCache ??= {};
		state.eventCache ??= {};
		init_lru_caches(state, CACHE_LIMITS);
	};
	source.saveState = function() {
		return JSON.stringify(state);
	};
	source.getHome = function() {
		const mode = Number(_settings.homeMode ?? HOME_MODES.POPULAR);
		if (mode === HOME_MODES.SEARCH) return new MixlrSearchPager(defaultSearchQuery(), selectedCategoryId(null), "all", 1);
		return new MixlrDiscoveryPager(mode === HOME_MODES.CATEGORY ? homeCategoryId() : "", 1);
	};
	source.getSearchCapabilities = () => ({
		types: [Type.Feed.Mixed],
		sorts: [Type.Order.Chronological, Type.Order.Popularity],
		filters: [
			contentFilter(),
			categoryFilter(),
			statusFilter()
		]
	});
	source.searchSuggestions = function(query) {
		const q = normalize(query);
		return [
			"radio",
			"sports",
			"music",
			"talk",
			"news",
			"religion",
			"church",
			"jazz",
			"culture",
			"live"
		].filter((item) => !q || normalize(item).indexOf(q) >= 0).slice(0, 10);
	};
	source.search = function(query, _type, _order, filters) {
		const q = normalize(query);
		const categoryId = selectedCategoryId(filters);
		if (!q && !hasSearchFilters(filters)) return source.getHome();
		return new MixlrSearchPager(query || defaultSearchQuery(), categoryId, selectedContent(filters), 1);
	};
	source.searchChannels = function(query) {
		if (!normalize(query)) return new ArrayChannelPager([rootChannel()], DEFAULT_LIMIT);
		return new MixlrChannelPager(query, 1);
	};
	source.isChannelUrl = function(url) {
		return Boolean(isRootUrl(url) || channelSlugFromUrl(url));
	};
	source.getChannel = function(url) {
		if (isRootUrl(url)) return rootChannel();
		return channelToPlatformChannel(fetchChannel(channelSlugFromUrl(url)));
	};
	source.getChannelContents = function(url, _type, _order, filters) {
		if (isRootUrl(url)) return source.search("", _type, _order, filters);
		const video = channelCurrentVideo(fetchChannel(channelSlugFromUrl(url)));
		return new ArrayVideoPager(video ? [video] : [], DEFAULT_LIMIT);
	};
	source.getSearchChannelContentsCapabilities = () => source.getSearchCapabilities();
	source.getChannelCapabilities = () => source.getSearchCapabilities();
	source.getPeekChannelTypes = () => ["Live"];
	source.peekChannelContents = function(url, _type) {
		return source.getChannelContents(url, null, null, null).results.slice(0, 6);
	};
	source.searchChannelContents = function(url, query, _type, _order, filters) {
		if (isRootUrl(url)) return source.search(query, _type, _order, filters);
		const video = channelCurrentVideo(fetchChannel(channelSlugFromUrl(url)));
		return new ArrayVideoPager(video && (!normalize(query) || videoMatches(video, query)) ? [video] : [], DEFAULT_LIMIT);
	};
	source.isPlaylistUrl = function(_url) {
		return false;
	};
	source.searchPlaylists = function(_query, _type, _order, _filters) {
		return new EmptyPlaylistPager();
	};
	source.getPlaylist = function(_url) {
		throw new ScriptException("Mixlr playlists are not supported until recordings or collections expose concrete playable contents");
	};
	source.getChannelPlaylists = function(_url) {
		return new EmptyPlaylistPager();
	};
	source.isContentDetailsUrl = function(url) {
		return Boolean(eventPartsFromUrl(url));
	};
	source.getContentDetails = function(url) {
		const parts = eventPartsFromUrl(url);
		if (!parts) throw new ScriptException("Unsupported Mixlr URL");
		return eventToVideo(fetchEvent(parts.slug, parts.eventId), fetchChannel(parts.slug));
	};
	var MixlrDiscoveryPager = class MixlrDiscoveryPager extends VideoPager {
		constructor(categoryId = "", page = 1, items = null, offset = 0, sourceHasMore = false, excludeUrl = null) {
			const loaded = items ? {
				items,
				hasMore: sourceHasMore,
				nextPage: page
			} : loadDiscovery(categoryId, page, excludeUrl);
			const results = loaded.items.slice(offset, offset + DEFAULT_LIMIT);
			const nextOffset = offset + DEFAULT_LIMIT;
			super(results, nextOffset < loaded.items.length || loaded.hasMore, {
				categoryId,
				page: loaded.nextPage,
				items: loaded.items,
				offset: nextOffset,
				sourceHasMore: loaded.hasMore,
				excludeUrl
			});
		}
		nextPage() {
			const remainingItems = this.context.offset < this.context.items.length ? this.context.items : null;
			const next = new MixlrDiscoveryPager(this.context.categoryId, this.context.page, remainingItems, remainingItems ? this.context.offset : 0, remainingItems ? this.context.sourceHasMore : false, this.context.excludeUrl);
			return apply_pager_state(this, next);
		}
	};
	var MixlrSearchPager = class MixlrSearchPager extends VideoPager {
		constructor(query, categoryId = "", content = "all", page = 1, items = null, offset = 0, sourceHasMore = false) {
			const loaded = items ? {
				items,
				hasMore: sourceHasMore,
				nextPage: page
			} : loadSearch(query, categoryId, content, page);
			const results = loaded.items.slice(offset, offset + DEFAULT_LIMIT);
			const nextOffset = offset + DEFAULT_LIMIT;
			super(results, nextOffset < loaded.items.length || loaded.hasMore, {
				query,
				categoryId,
				content,
				page: loaded.nextPage,
				items: loaded.items,
				offset: nextOffset,
				sourceHasMore: loaded.hasMore
			});
		}
		nextPage() {
			const remainingItems = this.context.offset < this.context.items.length ? this.context.items : null;
			const next = new MixlrSearchPager(this.context.query, this.context.categoryId, this.context.content, this.context.page, remainingItems, remainingItems ? this.context.offset : 0, remainingItems ? this.context.sourceHasMore : false);
			return apply_pager_state(this, next);
		}
	};
	var MixlrChannelPager = class MixlrChannelPager extends ChannelPager {
		constructor(query, page = 1, items = null, offset = 0, sourceHasMore = false) {
			const loaded = items ? {
				items,
				hasMore: sourceHasMore,
				nextPage: page
			} : loadChannelSearch(query, page);
			const results = loaded.items.slice(offset, offset + CHANNEL_LIMIT);
			const nextOffset = offset + CHANNEL_LIMIT;
			super(results, nextOffset < loaded.items.length || loaded.hasMore, {
				query,
				page: loaded.nextPage,
				items: loaded.items,
				offset: nextOffset,
				sourceHasMore: loaded.hasMore
			});
		}
		nextPage() {
			const remainingItems = this.context.offset < this.context.items.length ? this.context.items : null;
			const next = new MixlrChannelPager(this.context.query, this.context.page, remainingItems, remainingItems ? this.context.offset : 0, remainingItems ? this.context.sourceHasMore : false);
			return apply_pager_state(this, next);
		}
	};
	function loadDiscovery(categoryId, page, excludeUrl = null) {
		const html = fetchPage(discoveryUrl(categoryId, page));
		return {
			items: eventLinksToVideos(parseEventLinks(html), excludeUrl),
			hasMore: hasNextPage(html),
			nextPage: page + 1
		};
	}
	function loadSearch(query, categoryId, content, page) {
		const items = [];
		const includeEvents = content !== "channels";
		const includeChannels = content !== "events";
		let hasMore = false;
		if (includeEvents) {
			const html = fetchPage(searchUrl(query, "Event", page));
			items.push(...eventLinksToVideos(parseEventLinks(html), null, categoryId));
			hasMore = hasMore || hasNextPage(html);
		}
		if (includeChannels) {
			const html = fetchPage(searchUrl(query, "Channel", page));
			for (const slug of parseChannelSlugs(html)) {
				const video = safeChannelCurrentVideo(slug);
				if (video && (!categoryId || video.categoryId === categoryId)) items.push(video);
			}
			hasMore = hasMore || hasNextPage(html);
		}
		return {
			items: dedupeVideos(items),
			hasMore,
			nextPage: page + 1
		};
	}
	function loadChannelSearch(query, page) {
		const html = fetchPage(searchUrl(query, "Channel", page));
		return {
			items: parseChannelSlugs(html).map((slug) => safeChannel(slug)).filter(Boolean),
			hasMore: hasNextPage(html),
			nextPage: page + 1
		};
	}
	function eventLinksToVideos(links, excludeUrl = null, categoryId = "") {
		const videos = [];
		for (const link of links) {
			const video = safeEventVideo(link.slug, link.eventId);
			if (!video || video.url === excludeUrl || categoryId && video.categoryId !== categoryId) continue;
			videos.push(video);
		}
		return dedupeVideos(videos);
	}
	function safeEventVideo(slug, eventId) {
		try {
			return eventToVideo(fetchEvent(slug, eventId), null);
		} catch (e) {
			logIfTesting(`Skipping Mixlr event ${slug}/${eventId}: ${e}`);
			return null;
		}
	}
	function safeChannelCurrentVideo(slug) {
		try {
			return channelCurrentVideo(fetchChannel(slug));
		} catch (e) {
			logIfTesting(`Skipping Mixlr channel ${slug}: ${e}`);
			return null;
		}
	}
	function safeChannel(slug) {
		try {
			return channelToPlatformChannel(fetchChannel(slug));
		} catch (e) {
			logIfTesting(`Skipping Mixlr channel ${slug}: ${e}`);
			return null;
		}
	}
	function fetchPage(url) {
		return cached("pageCache", url, () => get_text(url, DEFAULT_HEADERS, false));
	}
	function fetchChannel(slug) {
		const cleanSlug = assertSlug(slug);
		return cached("channelCache", cleanSlug, () => normalizeChannel(cleanSlug, get_json(`${API_CDN_BASE}/channel_view/${cleanSlug}`, DEFAULT_HEADERS, false)));
	}
	function fetchEvent(slug, eventId) {
		const cleanSlug = assertSlug(slug);
		const cleanEventId = String(eventId ?? "").replace(/\D+/g, "");
		if (!cleanEventId) throw new ScriptException("Mixlr event id not found");
		return cached("eventCache", `${cleanSlug}:${cleanEventId}`, () => normalizeEvent(cleanSlug, cleanEventId, get_json(`${API_BASE}/channels/${cleanSlug}/events/${cleanEventId}`, DEFAULT_HEADERS, false)));
	}
	function cached(cacheName, key, loader) {
		const cacheKey = String(key);
		const cachedItem = state[cacheName]?.[cacheKey];
		if (cachedItem?.expiresAt > now()) return cachedItem.value;
		const value = loader();
		cache_set(state, CACHE_LIMITS, cacheName, cacheKey, {
			expiresAt: now() + CACHE_MAX_AGE_MS,
			value
		});
		return value;
	}
	function normalizeChannel(slug, response) {
		const attributes = response?.data?.attributes ?? {};
		return {
			slug,
			id: String(attributes.channel_id ?? attributes.owner_id ?? slug),
			ownerId: String(attributes.owner_id ?? attributes.channel_id ?? slug),
			name: clean_text(attributes.username || titleFromSlug(slug)),
			description: clean_text(attributes.about_me),
			followers: Number(attributes.followers_count ?? 0),
			listeners: Number(attributes.total_unique_listener_count ?? 0),
			live: attributes.live === true,
			artwork: mediaImage(attributes.media?.artwork) || attributes.artwork_url || iconUrl(),
			logo: mediaImage(attributes.media?.logo) || attributes.profile_image_url || iconUrl(),
			themeColor: attributes.theme_color,
			legacyUrl: attributes.legacy_livepage_url || `${BASE_URL}/${slug}`,
			included: response?.included ?? []
		};
	}
	function normalizeEvent(slug, eventId, response) {
		const attributes = response?.data?.attributes ?? {};
		const broadcast = (response?.included ?? []).find((item) => item?.type === "broadcast");
		return {
			slug,
			id: String(response?.data?.id ?? eventId),
			title: clean_text(attributes.title),
			description: clean_text(attributes.description),
			startedAt: attributes.started_at || attributes.starts_at,
			endedAt: attributes.ended_at || attributes.ends_at,
			active: attributes.active !== false,
			artwork: mediaImage(attributes.media?.artwork) || attributes.artwork_url || iconUrl(),
			color: attributes.color,
			legacyUrl: attributes.legacy_url || `${BASE_URL}/${slug}/events/${eventId}`,
			broadcast: normalizeBroadcast(broadcast)
		};
	}
	function normalizeBroadcast(item) {
		const attributes = item?.attributes ?? {};
		return {
			id: String(item?.id ?? attributes.uid ?? ""),
			uid: String(attributes.uid ?? item?.id ?? ""),
			title: clean_text(attributes.title),
			startedAt: attributes.started_at,
			eventId: String(attributes.event_id ?? ""),
			live: attributes.live === true,
			categoryName: clean_text(attributes.category_name),
			listenerCount: Number(attributes.listener_count ?? 0),
			heartCount: Number(attributes.heart_count ?? 0),
			streamUrl: attributes.progressive_stream_url
		};
	}
	function channelToPlatformChannel(channel) {
		return grayjay.channel(`channel-${channel.slug}`, {
			name: channel.name,
			thumbnail: channel.logo,
			banner: channel.artwork,
			subscribers: channel.followers,
			description: channel.description || `Mixlr live audio channel for ${channel.name}.`,
			url: channelUrl(channel.slug),
			urlAlternatives: [
				publicChannelUrl(channel.slug),
				`${BASE_URL}/${channel.slug}`,
				channel.legacyUrl
			].filter(Boolean)
		});
	}
	function rootChannel() {
		return grayjay.channel("root", {
			name: PLATFORM,
			thumbnail: iconUrl(),
			banner: iconUrl(),
			description: "Public Mixlr live audio channels and events.",
			url: BASE_URL,
			urlAlternatives: [
				BASE_URL,
				`${BASE_URL}/live/popular`,
				`${BASE_URL}/search`
			]
		});
	}
	function channelCurrentVideo(channel) {
		if (!channel.live) return null;
		const broadcastItem = channel.included.find((item) => item?.type === "broadcast");
		const eventItem = channel.included.find((item) => item?.type === "event");
		const broadcast = normalizeBroadcast(broadcastItem);
		if (!broadcast.live || !broadcast.streamUrl) return null;
		const eventAttributes = eventItem?.attributes ?? {};
		return buildVideo({
			slug: channel.slug,
			eventId: String(broadcast.eventId || eventItem?.id || broadcast.id),
			title: broadcast.title || clean_text(eventAttributes.title) || `${channel.name}'s live event`,
			description: clean_text(eventAttributes.description) || channel.description,
			startedAt: broadcast.startedAt || eventAttributes.started_at || eventAttributes.starts_at,
			artwork: mediaImage(eventAttributes.media?.artwork) || eventAttributes.artwork_url || channel.artwork,
			channelName: channel.name,
			channelDescription: channel.description,
			channelLogo: channel.logo,
			listenerCount: broadcast.listenerCount,
			categoryName: broadcast.categoryName,
			streamUrl: broadcast.streamUrl,
			shareUrl: publicEventUrl(channel.slug, broadcast.eventId || eventItem?.id)
		});
	}
	function eventToVideo(event, channel) {
		const broadcast = event.broadcast;
		if (!broadcast.live || !broadcast.streamUrl) throw new ScriptException("Mixlr event is not currently live");
		return buildVideo({
			slug: event.slug,
			eventId: event.id,
			title: broadcast.title || event.title || `${channel?.name || titleFromSlug(event.slug)}'s live event`,
			description: event.description || channel?.description || "",
			startedAt: broadcast.startedAt || event.startedAt,
			artwork: event.artwork || channel?.artwork || iconUrl(),
			channelName: channel?.name || titleFromSlug(event.slug),
			channelDescription: channel?.description || "",
			channelLogo: channel?.logo || iconUrl(),
			listenerCount: broadcast.listenerCount,
			categoryName: broadcast.categoryName,
			streamUrl: broadcast.streamUrl,
			shareUrl: publicEventUrl(event.slug, event.id)
		});
	}
	function buildVideo(item) {
		const categoryId = categoryIdFromName(item.categoryName);
		const details = grayjay.video(`event-${item.slug}-${item.eventId}`, {
			name: item.title,
			thumbnails: content_thumbnails(_config, DEFAULT_ICON, item.artwork),
			author: grayjay.author(`channel-${item.slug}`, item.channelName, channelUrl(item.slug), item.channelLogo),
			uploadDate: unixDate(item.startedAt),
			duration: -1,
			viewCount: item.listenerCount || 0,
			isLive: true,
			url: eventUrl(item.slug, item.eventId),
			description: videoDescription(item),
			video: audio_source_descriptor({
				name: "Live MP3",
				bitrate: 96e3,
				container: "audio/mpeg",
				codec: "mp3",
				duration: -1,
				url: item.streamUrl,
				language: "Unknown"
			}),
			live: null,
			rating: null,
			subtitles: [],
			shareUrl: item.shareUrl || publicEventUrl(item.slug, item.eventId)
		});
		details.categoryId = categoryId;
		details.getContentRecommendations = function() {
			return new MixlrDiscoveryPager(categoryId || homeCategoryId(), 1, null, 0, false, details.url);
		};
		return details;
	}
	function videoDescription(item) {
		return [
			item.description,
			item.categoryName ? `Category: ${item.categoryName}` : "",
			item.channelDescription && item.channelDescription !== item.description ? item.channelDescription : "",
			`Channel: ${item.channelName}`,
			`Source: ${item.shareUrl || publicEventUrl(item.slug, item.eventId)}`
		].filter(Boolean).join("\n");
	}
	function parseEventLinks(html) {
		const links = [];
		const seen = {};
		const regex = /href="(https:\/\/([a-z0-9-]+)\.mixlr\.com\/events\/(\d+)[^"]*)"/g;
		let match;
		while ((match = regex.exec(String(html ?? ""))) !== null) {
			const slug = match[2];
			const eventId = match[3];
			const key = `${slug}:${eventId}`;
			if (!seen[key]) {
				seen[key] = true;
				links.push({
					slug,
					eventId,
					url: decode_html(match[1])
				});
			}
		}
		return links;
	}
	function parseChannelSlugs(html) {
		const slugs = [];
		const seen = {};
		const regex = /href="https:\/\/([a-z0-9-]+)\.mixlr\.com\/?(?:[?#][^"]*)?"/g;
		let match;
		while ((match = regex.exec(String(html ?? ""))) !== null) {
			const slug = match[1];
			if (!seen[slug] && validSlug(slug)) {
				seen[slug] = true;
				slugs.push(slug);
			}
		}
		return slugs;
	}
	function hasNextPage(html) {
		return /rel="next"|class="next_page"/.test(String(html ?? ""));
	}
	function discoveryUrl(categoryId, page) {
		const query = query_string([["category_id", categoryId || null], ["page", page > 1 ? page : null]]);
		return `${BASE_URL}/live/popular${query ? `?${query}` : ""}`;
	}
	function searchUrl(query, type, page) {
		return `${BASE_URL}/search?${query_string([
			["query", String(query ?? "").trim()],
			["type", type],
			["page", page > 1 ? page : null]
		])}`;
	}
	function isRootUrl(url) {
		return REGEX.ROOT.test(String(url ?? ""));
	}
	function channelSlugFromUrl(url) {
		const value = String(url ?? "");
		let match = value.match(REGEX.CHANNEL) || value.match(REGEX.WEB_SUBDOMAIN_CHANNEL) || value.match(REGEX.WEB_LEGACY_CHANNEL);
		if (!match?.[1] || !validSlug(match[1])) return null;
		return match[1];
	}
	function eventPartsFromUrl(url) {
		const value = String(url ?? "");
		const match = value.match(REGEX.EVENT) || value.match(REGEX.WEB_SUBDOMAIN_EVENT) || value.match(REGEX.WEB_LEGACY_EVENT);
		if (!match?.[1] || !match?.[2] || !validSlug(match[1])) return null;
		return {
			slug: match[1],
			eventId: match[2]
		};
	}
	function assertSlug(slug) {
		const value = String(slug ?? "").trim().toLowerCase();
		if (!validSlug(value)) throw new ScriptException("Mixlr channel not found");
		return value;
	}
	function validSlug(slug) {
		const value = String(slug ?? "");
		return /^[a-z0-9][a-z0-9-]*$/.test(value) && RESERVED_SLUGS.indexOf(value) < 0;
	}
	function channelUrl(slug) {
		return `mixlr://channel/${slug}`;
	}
	function eventUrl(slug, eventId) {
		return `mixlr://event/${slug}/${eventId}`;
	}
	function publicChannelUrl(slug) {
		return `https://${slug}.mixlr.com`;
	}
	function publicEventUrl(slug, eventId) {
		return `https://${slug}.mixlr.com/events/${eventId}`;
	}
	function mediaImage(media) {
		return media?.image?.medium || media?.image?.large || media?.image?.small || media?.image_seo?.og_image || "";
	}
	function titleFromSlug(slug) {
		return String(slug ?? "").split("-").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
	}
	function unixDate(value) {
		const time = new Date(value ?? 0).getTime();
		return Number.isFinite(time) ? Math.floor(time / 1e3) : 0;
	}
	function now() {
		return Date.now();
	}
	function normalize(value) {
		return normalize_search_text(value);
	}
	function videoMatches(video, query) {
		const q = normalize(query);
		return !q || normalize(video.name).indexOf(q) >= 0 || normalize(video.description).indexOf(q) >= 0 || normalize(video.author?.name).indexOf(q) >= 0;
	}
	function dedupeVideos(items) {
		const seen = {};
		const results = [];
		for (const item of items) {
			if (!item?.url || seen[item.url]) continue;
			seen[item.url] = true;
			results.push(item);
		}
		return results;
	}
	function categoryIdFromName(name) {
		const normalized = normalize(name);
		return CATEGORIES.find((category) => normalize(category.name) === normalized)?.id ?? "";
	}
	function homeCategoryId() {
		return CATEGORIES[Number(_settings.homeCategory ?? 0)]?.id ?? "";
	}
	function selectedCategoryId(filters) {
		const selected = selectedFilterValues(filters, "category")[0];
		if (selected !== void 0) return filterValue(selected);
		return "";
	}
	function selectedContent(filters) {
		const selected = selectedFilterValues(filters, "content")[0];
		const value = filterValue(selected);
		return value === "events" || value === "channels" ? value : "all";
	}
	function hasSearchFilters(filters) {
		return selectedFilterValues(filters, "content").length > 0 || selectedFilterValues(filters, "category").length > 0;
	}
	function selectedFilterValues(filters, id) {
		if (!filters) return [];
		if (Array.isArray(filters)) return filters.filter((filter) => filter?.id === id || filter?.group?.id === id);
		if (typeof filters.get === "function") {
			const value = filters.get(id);
			return Array.isArray(value) ? value : value ? [value] : [];
		}
		const value = filters[id];
		return Array.isArray(value) ? value : value ? [value] : [];
	}
	function filterValue(value) {
		return String(value?.value ?? value?.id ?? value ?? "");
	}
	function contentFilter() {
		return {
			id: "content",
			name: "Content",
			isMultiSelect: false,
			filters: [
				{
					id: "all",
					name: "Live events and channels",
					value: "all"
				},
				{
					id: "events",
					name: "Live events",
					value: "events"
				},
				{
					id: "channels",
					name: "Live channels",
					value: "channels"
				}
			]
		};
	}
	function categoryFilter() {
		return {
			id: "category",
			name: "Category",
			isMultiSelect: false,
			filters: CATEGORIES.filter((category) => category.id).map((category) => ({
				id: category.id,
				name: category.name,
				value: category.id
			}))
		};
	}
	function statusFilter() {
		return {
			id: "status",
			name: "Status",
			isMultiSelect: false,
			filters: [{
				id: "live",
				name: "Live only",
				value: "live"
			}]
		};
	}
	function defaultSearchQuery() {
		return String(_settings.defaultSearch || "radio").trim() || "radio";
	}
	function iconUrl() {
		return plugin_icon_url(_config, DEFAULT_ICON);
	}
	function logIfTesting(message) {
		if (typeof IS_TESTING !== "undefined" && IS_TESTING) log(message);
	}
	var ArrayVideoPager = array_pager_class(VideoPager);
	var ArrayChannelPager = array_pager_class(ChannelPager);
	var EmptyPlaylistPager = empty_pager_class(PlaylistPager);

})();
