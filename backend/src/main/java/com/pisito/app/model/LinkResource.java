package com.pisito.app.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "link_resources")
public class LinkResource extends Resource {

    @Column(name = "url", nullable = false, length = 1000)
    private String url;

    @Column(name = "site_name", length = 255)
    private String siteName;

    @Column(name = "description", length = 2000)
    private String description;

    @Column(name = "content_preview", length = 4000)
    private String contentPreview;

    public LinkResource() {
        setType(ResourceType.LINK);
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getSiteName() {
        return siteName;
    }

    public void setSiteName(String siteName) {
        this.siteName = siteName;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getContentPreview() {
        return contentPreview;
    }

    public void setContentPreview(String contentPreview) {
        this.contentPreview = contentPreview;
    }
}

